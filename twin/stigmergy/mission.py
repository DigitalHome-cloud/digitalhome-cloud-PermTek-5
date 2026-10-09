# SPDX-License-Identifier: GPL-3.0-or-later
"""The explorer rover's mission, without Webots and without ROS.

The same code runs behind the plain Webots controller (controllers/explorer)
and behind the ROS 2 node (ros2/permaculture_twin); later behind a real
rover's driver. Each control step the adapter passes what the sensors said
(`Inputs`) and applies what the mission decided (`Outputs`).

Two modes. On a new site the rovers first EXPLORE the frame people drew:
it is cut into coverage cells, each rover claims the cells nobody has covered
yet, drives there inside the frame and writes "covered" traces; whatever its
front sensors meet that the map does not know becomes a Suggested finding.
When every cell is covered the store says so, and both switch to the POSTS
routine below. (docs/workflow.md, stage 4.)

Mission loop
  DOCKED   at the nest: sync stores with the other agents, recalibrate pose
  UNDOCK   reverse straight out of the nest
  PLAN     pick the posts whose traces have decayed most (read-time half-life),
           skip posts claimed by another agent, write claims
  GOTO     drive to the next post (fused position: odometry + IMU + RTK + UWB)
  INSPECT  read the post over IR; if another agent just inspected it, skip;
           otherwise probe soil, write the observation to the store and the
           "inspected" trace to the post
  RETURN / ALIGN / DOCKING back to the nest; reset pose at the dock

Rules from the design discussion
  - no confident position, no writing: traces need sigma <= MAX_SIGMA_WRITE
  - the web checks itself: an anchor that keeps disagreeing with the others is
    flagged as suspect, excluded, and an Inspection is suggested to a human
  - rovers never talk to each other: they meet only in the store (synced at
    the nest) and on the IR posts
"""
import json
import math
import os
import random
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from . import common as sc
from .nav import NavGrid, in_no_go
from .vegetation import props as veg_props

WHEEL_R = 0.1
TAG_ABOVE_GROUND = 0.95          # UWB tag on the mast
GNSS_LEVER = 0.95                # antenna height above the body origin (lever arm)
MAX_SIGMA_WRITE = 0.5            # m
POSTS_PER_MISSION = 3
CLAIM_H = 12.0                   # claim lease, garden hours
DOCK_WAIT_S = 30.0               # sim seconds between missions (= 1 garden hour)
TARGET_TIMEOUT_S = 240.0
CELL_TOL_M = 1.0                  # close enough to a coverage cell's centre
CELL_TIMEOUT_S = 90.0             # a coverage cell is not worth 8 garden hours: give it 3
JUST_INSPECTED_MIN = 45          # someone else was here this recently -> skip
SUSPECT_AFTER = 25               # outlier votes before an anchor is excluded
GNSS_EVERY = 6                   # use one GNSS fix every N control steps (~5 Hz RTK at 32 ms)
CELLS_PER_MISSION = 6             # coverage cells claimed per explore mission
CELL_CLAIM_H = 6.0                # claim lease on a cell, garden hours
SCAN_S = 2.0                      # pause at a cell's centre (camera, microphone)
FINDING_DEDUP_M = 1.5             # sightings this close are the same thing
SIGHTING_GAP_H = 0.5              # a second sighting this much later confirms a finding
WHEELS = ("fl", "fr", "rl", "rr")
RANGES = ("ds_front_left", "ds_front_center", "ds_front_right", "drop_left", "drop_right")


@dataclass
class Inputs:
    """What the rover's sensors said during this control step."""
    t: float                                        # sim (or rover) time, s
    encoders: List[float]                           # wheel angles fl, fr, rl, rr, rad
    rpy: Tuple[float, float, float]                 # roll, pitch, yaw, rad
    gnss: Optional[Tuple[float, float, float]]      # antenna position, local ENU m (None = no fix)
    ranges: Dict[str, float]                        # distance sensors by name, raw value (mm)
    field_msgs: List[dict] = field(default_factory=list)   # {"rtk", "uwb", "soil", "h"} from the field
    ir_frames: List[bytes] = field(default_factory=list)   # IR frames heard from posts


@dataclass
class Outputs:
    wheels: Tuple[float, float]                     # left, right wheel speed, rad/s (held until changed)
    ir_frames: List[bytes]                          # IR frames to send to a post
    pose: Optional[dict]                            # once a second: x, y, sigma, state


class Localizer:
    def __init__(self, x, y, log):
        self.x, self.y = x, y
        self.P = 0.01 ** 2
        self.prev = None
        self.rejects = 0
        self.log = log

    @property
    def sigma(self):
        return math.sqrt(self.P)

    def predict(self, enc_vals, yaw, pitch=0.0):
        if self.prev is None or any(math.isnan(v) for v in enc_vals):
            self.prev = enc_vals
            return
        d = WHEEL_R * sum(a - b for a, b in zip(enc_vals, self.prev)) / len(enc_vals)
        d *= math.cos(pitch)                           # wheels measure along the slope; keep the horizontal part
        self.prev = enc_vals
        self.x += d * math.cos(yaw)
        self.y += d * math.sin(yaw)
        self.P += (0.04 * abs(d)) ** 2 + 1e-7       # odometry drift (slip on clay)

    def update(self, zx, zy, r_var):
        innov = math.hypot(zx - self.x, zy - self.y)
        gate = max(1.5, 4.0 * math.sqrt(self.P + r_var))
        if innov > gate:
            self.rejects += 1
            if self.rejects > 40:                    # we are the ones who are wrong: relocalize
                self.log(f"estimate disagrees with fixes by {innov:.1f} m -> relocalizing")
                self.reset(zx, zy, r_var)
            return False
        self.rejects = 0
        k = self.P / (self.P + r_var)
        self.x += k * (zx - self.x)
        self.y += k * (zy - self.y)
        self.P = max(self.P * (1 - k), 0.04 ** 2)   # floor: antenna tilt, timing, model error
        return True

    def reset(self, x, y, var=0.04 ** 2):
        self.x, self.y, self.P = x, y, var
        self.rejects = 0


def quat_to_rpy(x, y, z, w):
    """Roll, pitch, yaw (rad) from an orientation quaternion, as Webots' InertialUnit reports them."""
    roll = math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y))
    pitch = math.asin(max(-1.0, min(1.0, 2 * (w * y - z * x))))
    yaw = math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))
    return roll, pitch, yaw


def lever_arm(roll, pitch, yaw):
    """Horizontal offset of the GNSS antenna from the body origin when the rover is tilted.
    On a 24 deg slope the antenna leans ~0.4 m off the wheels."""
    ox = GNSS_LEVER * (math.cos(yaw) * math.sin(pitch) * math.cos(roll) + math.sin(yaw) * math.sin(roll))
    oy = GNSS_LEVER * (math.sin(yaw) * math.sin(pitch) * math.cos(roll) - math.cos(yaw) * math.sin(roll))
    return ox, oy


class Mission:
    def __init__(self, cfg, name, store, log=print, rng=None, start_delay_s=None):
        self.cfg = cfg
        self.name = name
        self.store = store
        self._print = log
        self.hl = cfg["half_lives_h"]
        self.anchors = {a["id"]: a["pos"] for a in cfg["anchors"]}
        self.posts = {p["id"]: p for p in cfg["posts"]}
        self.dock = cfg["docks"][name]
        self.rng = rng if rng is not None else random.Random(hash(name) & 0xFFFF)
        self.t = 0.0
        self.loc = Localizer(self.dock[0], self.dock[1], self.log)
        self.suspect_votes = {}
        self.suspects = set()
        self.radio = {"rtk": "fix", "uwb": [], "soil": None, "h": 0.0}
        self.ir_seen = {}        # post id -> {"t": time, "age_min":..., "moist":...}
        self.avoid = {"steps": 0, "l": 0.0, "r": 0.0}
        self.path = []
        self.stuck = {"t": 0.0, "x": 0.0, "y": 0.0}
        self.dock_yaw = self.dock[2]
        self.dock_dir = (math.cos(self.dock_yaw), math.sin(self.dock_yaw))
        self.state = "DOCKED"
        self.state_t = 0.0
        self.route, self.target = [], None
        self.inspect_writes = 0
        self.next_report = 0.0
        self.n_steps = 0
        self.dock_wait = start_delay_s if start_delay_s is not None else (5.0 if name == "rover1" else 45.0)
        self.wheels = (0.0, 0.0)
        self.ranges = {}
        self._ir_out = []
        self.grid = NavGrid(cfg) if "frame" in cfg else None
        self.findings = []                               # (x, y) of findings known from the store
        mcfg = cfg.get("mission", {})
        self.cell_m = mcfg.get("cell_m", 4.0)
        self.mode = "explore" if mcfg.get("explore_first") and self.grid else "posts"
        self.cells = self._coverage_cells() if self.mode == "explore" else {}
        self.cur_cell = None
        trace = os.environ.get("PERMA_TRACE")          # a folder: every step's inputs, to compare two adapters
        self._trace = open(os.path.join(trace, f"inputs_{name}.jsonl"), "w") if trace else None
        self.log(f"ready at dock {self.dock[:2]}")

    # -------------------------------------------------------------- coverage cells
    def cell_of(self, x, y):
        fence = self.cfg["frame"]["geofence"]
        x0, y0 = min(p[0] for p in fence), min(p[1] for p in fence)
        return f"{int((x - x0) // self.cell_m)}_{int((y - y0) // self.cell_m)}"

    def _coverage_cells(self):
        """Cell id -> a drivable point near its centre, for every cell reachable from the dock."""
        fence = self.cfg["frame"]["geofence"]
        x0, y0 = min(p[0] for p in fence), min(p[1] for p in fence)
        x1, y1 = max(p[0] for p in fence), max(p[1] for p in fence)
        reach = self.grid.reachable(self.dock[:2])
        cells, m = {}, self.cell_m
        for a in range(int((x1 - x0) // m) + 1):
            for b in range(int((y1 - y0) // m) + 1):
                cx, cy = x0 + (a + 0.5) * m, y0 + (b + 0.5) * m
                c = self.grid.nearest_free(cx, cy, max_r=m / 2)
                if c is not None and c in reach:
                    cells[f"{a}_{b}"] = self.grid.center(*c)
        return cells

    def note_coverage(self):
        if self.mode != "explore" or self.state in ("DOCKED", "UNDOCK", "ALIGN", "DOCKING"):
            return
        cid = self.cell_of(self.loc.x, self.loc.y)
        if cid != self.cur_cell:
            self.cur_cell = cid
            if cid in self.cells and self.loc.sigma <= MAX_SIGMA_WRITE:
                self.store.write({"type": "covered", "cell": cid, "t_h": self.garden_h()})

    # -------------------------------------------------------------- findings
    def sync_findings(self):
        for r in self.store.records("finding"):
            xy = (r["x"], r["y"])
            if xy not in self.findings:
                self.findings.append(xy)
                if self.grid:
                    self.grid.add_obstacle(r["x"], r["y"], 0.3)

    def note_obstacle(self, yaw):
        """The front sensors meet something the map does not know: write a sighting.
        Two sightings at the same place at least SIGHTING_GAP_H apart (any rover) make a
        finding: Suggested to people, and an obstacle in the rovers' map. A moving rover is
        never seen twice in the same place; a rock is. Returns True for a new finding."""
        near = min(self.ranges[n] for n in ("ds_front_left", "ds_front_center", "ds_front_right")) / 1000.0
        x = self.loc.x + (near + 0.2) * math.cos(yaw)
        y = self.loc.y + (near + 0.2) * math.sin(yaw)
        now = self.garden_h()
        if self.loc.sigma > MAX_SIGMA_WRITE:
            return False
        if any(math.hypot(x - ox, y - oy) < r + 0.6 for ox, oy, r in self.cfg.get("obstacles", [])):
            return False                                    # a known tree, post, nest...
        if any("polygon" in v and veg_props(v)["solid"] and in_no_go(x, y, v, 0.6)
               for v in self.cfg.get("vegetation", [])):
            return False                                    # a mapped hedge or bramble thicket
        if any(math.hypot(x - d[0], y - d[1]) < 2.0 for d in self.cfg["docks"].values()):
            return False                                    # rovers parked at the nest
        if any(math.hypot(x - fx, y - fy) < FINDING_DEDUP_M for fx, fy in self.findings):
            return False                                    # already a finding
        sightings = list(self.store.records("sighting"))
        if any(r["agent"] == self.name and abs(now - r["t_h"]) < SIGHTING_GAP_H
               and math.hypot(x - r["x"], y - r["y"]) < FINDING_DEDUP_M for r in sightings):
            return False                                    # seen it a moment ago
        self.store.write({"type": "sighting", "x": round(x, 2), "y": round(y, 2), "sigma": round(self.loc.sigma, 3),
                          "t_h": now})
        earlier = [r for r in sightings if now - r["t_h"] >= SIGHTING_GAP_H
                   and math.hypot(x - r["x"], y - r["y"]) < FINDING_DEDUP_M]
        if not earlier:
            return False
        fx = round((x + sum(r["x"] for r in earlier)) / (1 + len(earlier)), 2)
        fy = round((y + sum(r["y"] for r in earlier)) / (1 + len(earlier)), 2)
        self.findings.append((fx, fy))
        self.store.write({"type": "finding", "kind": "obstacle", "status": "Suggested", "x": fx, "y": fy,
                          "sightings": 1 + len(earlier), "t_h": now})
        self.log(f"finding: unknown obstacle at ({fx:.1f}, {fy:.1f}), seen {1 + len(earlier)} times, suggested")
        if self.grid:
            self.grid.add_obstacle(fx, fy, 0.3)
        return True

    # -------------------------------------------------------------- helpers
    def garden_h(self):
        return self.t * self.cfg["time_scale"] / 3600.0

    def log(self, msg):
        self._print(f"[{self.name}] h={self.garden_h():.1f} {msg}")

    def set_speed(self, left, right):
        self.wheels = (left, right)

    def go(self, new):
        self.state, self.state_t = new, self.t

    # -------------------------------------------------------------- sensing
    def sense(self, inp):
        roll, pitch, yaw = inp.rpy
        self.loc.predict(list(inp.encoders), yaw, pitch)
        for m in inp.field_msgs:
            self.radio.update(m)
            if "uwb" in m:
                self.uwb_update(m["uwb"])
        self.n_steps += 1
        g = inp.gnss
        if self.n_steps % GNSS_EVERY == 0 and g is not None and not any(math.isnan(v) for v in g):
            r_var = 0.03 ** 2 if self.radio["rtk"] == "fix" else 2.5 ** 2
            ox, oy = lever_arm(roll, pitch, yaw)
            self.loc.update(g[0] - ox, g[1] - oy, r_var)
        return yaw

    def uwb_update(self, ranges):
        zt = sc.plane_z(self.cfg, self.loc.x, self.loc.y) + TAG_ABOVE_GROUND
        ms = []
        for aid, r in ranges:
            if aid in self.suspects or aid not in self.anchors:
                continue
            ax, ay, az = self.anchors[aid]
            dz = az - zt
            ms.append((aid, ax, ay, math.sqrt(max(0.0, r * r - dz * dz))))
        fix = sc.uwb_fix(ms)
        if not fix:
            return
        x, y, rms, outlier = fix
        if outlier is not None:
            self.suspect_votes[outlier] = self.suspect_votes.get(outlier, 0) + 1
            if self.suspect_votes[outlier] >= SUSPECT_AFTER and outlier not in self.suspects:
                self.suspects.add(outlier)
                self.log(f"UWB anchor {outlier} disagrees with the others -> excluded, inspection suggested")
                self.store.write({"type": "anchor_suspect", "anchor": outlier, "t_h": self.garden_h(),
                                  "votes": self.suspect_votes[outlier]})
                self.store.write({"type": "intervention", "interventionType": "Inspection", "status": "Suggested",
                                  "target": f"uwb_anchor_{outlier}", "reason": "anchor position inconsistent",
                                  "t_h": self.garden_h()})
        if rms < 0.25:
            self.loc.update(x, y, 0.15 ** 2)

    def read_ir(self, frames):
        for data in frames:
            fr = sc.decode_frame(data)
            if not fr:
                continue
            pid, ftype, val = fr
            s = self.ir_seen.setdefault(pid, {})
            s["t"] = self.t
            if ftype == sc.T_STATUS:
                s["age_min"] = None if val == sc.NEVER else val
            elif ftype == sc.T_MOIST:
                s["moist"] = val / 10.0

    def heard(self, pid, within_s=1.5):
        s = self.ir_seen.get(pid)
        return s is not None and self.t - s.get("t", -99) <= within_s

    # -------------------------------------------------------------- driving
    def drive_to(self, tx, ty, yaw, vmax=4.0, tol=0.4):
        """One control step towards (tx, ty). Returns True when arrived."""
        loc, avoid, ds = self.loc, self.avoid, self.ranges
        dx, dy = tx - loc.x, ty - loc.y
        dist = math.hypot(dx, dy)
        if dist < tol:
            self.set_speed(0, 0)
            return True
        if avoid["steps"] > 0:
            avoid["steps"] -= 1
            self.set_speed(avoid["l"], avoid["r"])
            return False
        fl, fc, fr = (ds[n] / 1000.0 for n in ("ds_front_left", "ds_front_center", "ds_front_right"))
        drop = max(ds["drop_left"], ds["drop_right"]) / 1000.0
        if drop > 0.45:                                  # pond edge, pad cut
            turn = 3.0 if self.rng.random() < 0.5 else -3.0
            avoid.update(steps=60, l=-3.0, r=-3.0)       # back up ~1.9 s
            self.set_speed(-3.0, -3.0)
            avoid["then"] = (turn, -turn)
            return False
        near = min(fl, fc, fr)
        if near < min(0.6, dist - 0.2):                  # unexpected obstacle (rover, fallen branch...)
            if fl < fr:
                avoid.update(steps=18, l=2.5, r=-1.0)
            else:
                avoid.update(steps=18, l=-1.0, r=2.5)
            return "blocked"
        err = sc.wrap(math.atan2(dy, dx) - yaw)
        if abs(err) > 0.5:
            # turn in a forward arc, inner wheel never reversing: a pivot on the slope scrubs the
            # wheels sideways and the rover slides downhill (lesson 6; in exploration it slid 2-3 m
            # out of the frame). Tighter for big heading changes, but always rolling forward.
            inner, outer = (0.2, 2.6) if abs(err) > 1.2 else (1.0, 3.2)
            self.set_speed(inner, outer) if err > 0 else self.set_speed(outer, inner)
            return False
        v = min(vmax, 1.5 + dist)
        self.set_speed(v - 3.0 * err, v + 3.0 * err)
        return False

    def finish_avoid(self):
        if self.avoid["steps"] == 0 and self.avoid.get("then"):
            left, right = self.avoid.pop("then")
            self.avoid.update(steps=30, l=left, r=right)

    # -------------------------------------------------------------- mission planning
    def plan(self):
        """The next mission: a list of ("cell", id) or ("post", id)."""
        self.store.sync()
        self.sync_findings()
        if self.mode == "explore":
            route = self.plan_explore()
            if route is not None:
                return route
            self.mode = "posts"
            self.log("exploration complete: every cell covered -> post routine")
            self.store.write({"type": "explore_done", "t_h": self.garden_h(), "cells": len(self.cells)})
        return [("post", pid) for pid in self.plan_posts()]

    def plan_explore(self):
        store, now = self.store, self.garden_h()
        covered = {r["cell"] for r in store.records("covered")}
        todo = [c for c in self.cells if c not in covered]
        if not todo:
            return None
        claimed = store.active_claims(now, exclude_agent=self.name, key="cell")
        cand = [c for c in todo if c not in claimed]
        route, px, py = [], self.loc.x, self.loc.y            # greedy nearest-neighbour chain
        while cand and len(route) < CELLS_PER_MISSION:
            c = min(cand, key=lambda k: math.hypot(self.cells[k][0] - px, self.cells[k][1] - py))
            cand.remove(c)
            route.append(c)
            px, py = self.cells[c]
        for c in route:
            store.write({"type": "claim", "cell": c, "t_h": now, "expires_h": now + CELL_CLAIM_H})
        self.log(f"explore: {len(self.cells) - len(todo)}/{len(self.cells)} cells covered, "
                 f"{len(claimed)} claimed by others, taking {len(route)}")
        return [("cell", c) for c in route]

    def plan_posts(self):
        store, cfg = self.store, self.cfg
        store.sync()
        now = self.garden_h()
        claimed = store.active_claims(now, exclude_agent=self.name)
        cand = []
        for pid in self.posts:
            if pid in claimed:
                continue
            last = store.last_visit_h(pid)
            s = self.ir_seen.get(pid)                          # what the post itself said last time
            if s and s.get("age_min") is not None and s.get("t") is not None:
                ir_last = s["t"] * cfg["time_scale"] / 3600.0 - s["age_min"] / 60.0
                last = ir_last if last is None else max(last, ir_last)
            age = None if last is None else now - last
            need = 1.0 - sc.weight(age, self.hl["visit"])
            cand.append((need, pid))
        cand.sort(reverse=True)
        chosen = [pid for need, pid in cand[:POSTS_PER_MISSION] if need > 0.3]
        route, px, py = [], self.loc.x, self.loc.y             # greedy nearest-neighbour order
        while chosen:
            pid = min(chosen, key=lambda p: math.hypot(self.posts[p]["pos"][0] - px, self.posts[p]["pos"][1] - py))
            chosen.remove(pid)
            route.append(pid)
            px, py = self.posts[pid]["pos"]
        for pid in route:
            store.write({"type": "claim", "post": pid, "t_h": now, "expires_h": now + CLAIM_H})
        if claimed:
            self.log(f"skipping posts claimed by others: {claimed}")
        return route

    def dock_approach(self, back=3.0):
        """Point on the dock line, `back` metres before the dock."""
        return (self.dock[0] - back * self.dock_dir[0], self.dock[1] - back * self.dock_dir[1])

    def set_path(self, goal_xy):
        """Waypoints to the goal inside the frame: contour-first, fascines only at their passages."""
        start = (self.loc.x, self.loc.y)
        if self.grid is None:                               # no frame in the config: the old straight-line planner
            self.path = sc.plan_path(self.cfg, start, goal_xy)
        else:
            path = self.grid.plan(start, goal_xy)
            if path is None and self.findings:              # a wrong finding may block the way: plan without them
                self.grid = NavGrid(self.cfg)
                path = self.grid.plan(start, goal_xy)
                self.log("no path around the findings; planning with the map only")
            if path is None:
                self.log(f"no path inside the frame to ({goal_xy[0]:.1f}, {goal_xy[1]:.1f})")
                path = [tuple(goal_xy)]
            self.path = path
        self.stuck.update(t=self.t, x=self.loc.x, y=self.loc.y)

    def follow(self, yaw, vmax=4.0, tol=0.35):
        """Follow the current path; True when the last waypoint is reached."""
        path, loc, stuck = self.path, self.loc, self.stuck
        if not path:
            return True
        recovering = getattr(self, "_recovering", False)
        if self.grid and not recovering and not self.grid.in_frame_margin(loc.x, loc.y):
            c = self.grid.nearest_free(loc.x, loc.y)            # slid out towards the fence: back in first
            if c is not None:
                path.insert(0, self.grid.center(*c))
                self._recovering = True
                self.log(f"too close to the frame's edge at ({loc.x:.1f}, {loc.y:.1f}), going back in")
        elif recovering and self.grid and self.grid.in_frame_margin(loc.x, loc.y):
            self._recovering = False
        last = len(path) == 1
        res = self.drive_to(path[0][0], path[0][1], yaw, vmax=vmax, tol=tol if last else 0.6)
        if res is True:
            path.pop(0)
            return not path
        if res == "blocked" and self.t - stuck.get("last_side", -99) > 5.0:
            stuck["last_side"] = self.t
            if self.note_obstacle(yaw) and self.grid:      # something new: plan around it
                self.set_path(path[-1])
                return False
            # sidestep around it with a temporary waypoint, on the freer side, never out of the frame
            side = 1.0 if self.ranges["ds_front_left"] > self.ranges["ds_front_right"] else -1.0
            for s_ in (side, -side):
                wp = (loc.x + 0.8 * math.cos(yaw) - s_ * 1.2 * math.sin(yaw),
                      loc.y + 0.8 * math.sin(yaw) + s_ * 1.2 * math.cos(yaw))
                if self.grid is None or self.grid.drivable(*wp):
                    path.insert(0, wp)
                    break
        # stuck detection: hardly moved for 20 s while trying to drive
        if self.t - stuck["t"] > 20.0:
            if math.hypot(loc.x - stuck["x"], loc.y - stuck["y"]) < 0.3 and self.avoid["steps"] == 0:
                self.log("stuck, backing out")
                turn = 3.0 if self.rng.random() < 0.5 else -3.0
                self.avoid.update(steps=45, l=-3.0, r=-3.0, then=(turn, -turn))
            stuck.update(t=self.t, x=loc.x, y=loc.y)
        return False

    # -------------------------------------------------------------- one control step
    def step(self, inp: Inputs) -> Outputs:
        self.t = inp.t
        self.ranges = inp.ranges
        self._ir_out = []
        yaw = self.sense(inp)
        self.note_coverage()
        self.read_ir(inp.ir_frames)
        self.finish_avoid()
        pose = None
        if self.t >= self.next_report:
            self.next_report = self.t + 1.0
            pose = {"name": self.name, "x": self.loc.x, "y": self.loc.y, "sigma": self.loc.sigma,
                    "state": self.state}
        self._state_step(yaw)
        out = Outputs(wheels=self.wheels, ir_frames=self._ir_out, pose=pose)
        if self._trace:
            self._trace.write(json.dumps({"t": round(inp.t, 6), "enc": inp.encoders, "rpy": list(inp.rpy),
                                          "gnss": inp.gnss and list(inp.gnss), "ranges": inp.ranges,
                                          "field": inp.field_msgs, "ir": [f.hex() for f in inp.ir_frames],
                                          "out_wheels": list(out.wheels),
                                          "out_ir": [f.hex() for f in out.ir_frames]}) + "\n")
        return out

    def _state_step(self, yaw):
        t, loc, store, posts = self.t, self.loc, self.store, self.posts
        state = self.state

        if state == "DOCKED":
            self.set_speed(0, 0)
            if t - self.state_t >= self.dock_wait:
                self.dock_wait = DOCK_WAIT_S
                self.route = self.plan()
                if self.route:
                    self.log("mission: " + ", ".join(f"{k} {i}" for k, i in self.route))
                    self.go("UNDOCK")
                else:
                    self.state_t = t                          # nothing stale enough; wait again

        elif state == "UNDOCK":
            self.set_speed(-2.0, -2.0)                         # reverse straight out of the nest
            if t - self.state_t > 6.0:
                self.set_speed(0, 0)
                self.go("NEXT")

        elif state == "NEXT":
            if self.route:
                self.target = self.route.pop(0)
                kind, tid = self.target
                self.set_path(tuple(posts[tid]["stand"]) if kind == "post" else self.cells[tid])
                self.go("GOTO")
            else:
                self.set_path(self.dock_approach())
                self.go("RETURN")

        elif state == "GOTO":
            kind, tid = self.target
            if loc.sigma > 1.0:
                self.set_speed(0, 0)                          # lost: stop and wait for fixes
                if t - self.state_t > TARGET_TIMEOUT_S:
                    self.log(f"lost near {kind} {tid} (sigma {loc.sigma:.1f} m), giving up target")
                    store.write({"type": "release", kind: tid, "t_h": self.garden_h()})
                    self.go("NEXT")
                return
            # a 4 m coverage cell is reached within 1 m: no overshoot and pivot on the slope (lesson 6)
            if self.follow(yaw, tol=0.35 if kind == "post" else CELL_TOL_M):
                self.go("INSPECT" if kind == "post" else "SCAN")
                self.inspect_writes = 0
            elif t - self.state_t > (TARGET_TIMEOUT_S if kind == "post" else CELL_TIMEOUT_S):
                self.log(f"could not reach {kind} {tid}, releasing claim")
                store.write({"type": "release", kind: tid, "t_h": self.garden_h()})
                self.go("NEXT")

        elif state == "SCAN":                                   # explore: look and listen at the cell's centre
            self.set_speed(0, 0)
            if t - self.state_t >= SCAN_S:
                if loc.sigma <= MAX_SIGMA_WRITE:
                    store.write({"type": "covered", "cell": self.target[1], "t_h": self.garden_h(), "scan": True})
                self.go("NEXT")

        elif state == "INSPECT":
            self.set_speed(0, 0)
            if t - self.state_t < 3.0:                         # settle, listen, probe
                return
            target = self.target[1]
            s = self.ir_seen.get(target, {})
            if (self.inspect_writes == 0 and self.heard(target) and s.get("age_min") is not None
                    and s["age_min"] < JUST_INSPECTED_MIN):
                self.log(f"post {target} inspected {s['age_min']} min ago by another agent -> skip (stigmergy)")
                store.write({"type": "skip", "post": target, "t_h": self.garden_h(), "reason": "fresh trace on post"})
                self.go("NEXT")
                return
            if loc.sigma > MAX_SIGMA_WRITE:
                self.log(f"post {target}: position too uncertain ({loc.sigma:.2f} m), not writing")
                store.write({"type": "release", "post": target, "t_h": self.garden_h()})
                self.go("NEXT")
                return
            moist = self.radio["soil"]
            now = self.garden_h()
            if self.inspect_writes == 0:
                store.write({"type": "observation", "property": "soilMoisture", "value": moist, "unit": "PERCENT",
                             "post": target, "zone": posts[target]["zone"], "x": round(loc.x, 2),
                             "y": round(loc.y, 2), "sigma": round(loc.sigma, 3), "t_h": now,
                             "half_life_h": self.hl["soilMoisture"]})
                store.write({"type": "visit", "post": target, "t_h": now, "ir_ok": self.heard(target)})
                if moist is not None and moist < 12.0:
                    store.write({"type": "intervention", "interventionType": "Watering", "status": "Suggested",
                                 "target": posts[target]["label"], "reason": f"soil {moist:.1f} % < 12 %",
                                 "t_h": now})
                self.log(f"post {target} ({posts[target]['label']}): soil {moist:.1f} %, "
                         f"IR {'ok' if self.heard(target) else 'not heard'}, sigma {loc.sigma:.2f} m")
            self._ir_out.append(sc.encode_frame(target, sc.T_WRITE, (moist or 0) * 10))
            self.inspect_writes += 1
            if self.inspect_writes >= 3:
                self.go("NEXT")

        elif state == "RETURN":
            if self.follow(yaw, tol=0.5):
                ax, ay = self.dock_approach()
                if math.hypot(loc.x - ax, loc.y - ay) > 0.8:
                    self.set_path(self.dock_approach())
                else:
                    self.go("ALIGN")
            elif t - self.state_t > TARGET_TIMEOUT_S * 2:
                self.log("return timeout, replanning")
                self.set_path(self.dock_approach())
                self.state_t = t

        elif state == "ALIGN":                                  # face along the dock line
            err = sc.wrap(self.dock_yaw - yaw)
            if abs(err) < 0.08 or t - self.state_t > 15.0:
                self.set_speed(0, 0)
                self.go("DOCKING")
            else:
                s_ = max(0.8, min(2.0, 3.0 * abs(err)))
                self.set_speed(-s_ if err > 0 else s_, s_ if err > 0 else -s_)

        elif state == "DOCKING":
            # creep along the dock line (along the contour) until the front sensor touches the nest wall
            dock, dd = self.dock, self.dock_dir
            along = (loc.x - dock[0]) * dd[0] + (loc.y - dock[1]) * dd[1]
            ax_ = dock[0] + (along + 1.0) * dd[0]
            ay_ = dock[1] + (along + 1.0) * dd[1]
            err = sc.wrap(math.atan2(ay_ - loc.y, ax_ - loc.x) - yaw)
            front = self.ranges["ds_front_center"] / 1000.0
            if front > 0.15:
                self.set_speed(1.5 - 2.0 * err, 1.5 + 2.0 * err)
            else:
                self.set_speed(0, 0)
                corr = math.hypot(loc.x - dock[0], loc.y - dock[1])
                if corr < 0.4:                                   # fused, lever-arm corrected position agrees: our dock
                    loc.reset(dock[0], dock[1])
                    n_new = store.sync()
                    store.write({"type": "recalibration", "t_h": self.garden_h(), "correction_m": round(corr, 3),
                                 "synced_records": n_new})
                    self.log(f"docked, pose correction {corr:.2f} m, synced {n_new} new traces")
                    self.go("DOCKED")
                else:
                    self.log("touched something that is not my dock, backing off")
                    self.avoid.update(steps=40, l=-2.0, r=-2.0)
                    self.set_path(self.dock_approach())
                    self.go("RETURN")
            if t - self.state_t > 60.0:
                self.log("docking timeout, retrying the approach")
                self.set_path(self.dock_approach())
                self.go("RETURN")
