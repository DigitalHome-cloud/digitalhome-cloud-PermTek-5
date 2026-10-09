# SPDX-License-Identifier: GPL-3.0-or-later
"""The garden itself: everything the rovers cannot get from their own devices.

  - soil moisture field (autan drying, oak shade, fascines, rain)
  - RTK status: fix in the open, float under the oak canopy
    (also degrades the rover GPS accuracy field)
  - UWB ranging to the anchors (true 3D distance + noise)
  - sunlight shortening the IR range of the posts around midday
  - events: autan, rain, a wild boar knocking over an anchor
  - ground truth: logs each rover's estimated vs true position

No Webots import here: the caller passes its Supervisor object (plain
controller or webots_ros2 plugin) and a `send(rover, msg)` function that
delivers the field's readings to that rover (radio, or ROS topics).
"""
import csv
import math
import os
import random

from . import common as sc
from .nav import in_frame

ANCHOR_H = 1.5
UWB_RANGE = 30.0
UWB_SIGMA = 0.05


class Garden:
    def __init__(self, sup, cfg, send, log=print):
        self.sup = sup
        self.cfg = cfg
        self.send = send
        self.print = log
        self.rng = random.Random(42)
        self.rovers = {name: sup.getFromDef(d) for name, d in cfg["rovers"].items()}
        self.anchors = {a["id"]: sup.getFromDef(a["def"]) for a in cfg["anchors"]}
        self.posts = {p["id"]: sup.getFromDef(p["def"]) for p in cfg["posts"]}
        self.soil = sc.SoilField(cfg)
        self.ev = cfg["events"]
        self.boar_done = False
        self.rain_done = False
        self.last_h = 0.0
        self.last_sun_h = -1.0
        self.under = {name: None for name in self.rovers}
        self.n = 0
        os.makedirs(sc.DATA_DIR, exist_ok=True)
        self.log_fh = open(os.path.join(sc.DATA_DIR, "truth_log.csv"), "w", newline="")
        self.log = csv.writer(self.log_fh)
        self.log.writerow(["sim_s", "garden_h", "rover", "true_x", "true_y", "est_x", "est_y", "est_sigma",
                           "error_m", "state"])
        self.err_stats = {name: [] for name in self.rovers}
        self.next_report_h = 6.0
        self.frame_fh = open(os.path.join(sc.DATA_DIR, "frame_log.csv"), "w", newline="")
        self.frame_log = csv.writer(self.frame_fh)
        self.frame_log.writerow(["sim_s", "garden_h", "rover", "true_x", "true_y"])
        self.violations = {name: 0 for name in self.rovers}
        self.print(f"[garden] started: {len(self.rovers)} rovers, {len(self.anchors)} UWB anchors, "
                   f"{len(self.posts)} IR posts, 1 sim s = {cfg['time_scale'] / 60:.0f} garden min")

    def garden_h(self):
        return self.sup.getTime() * self.cfg["time_scale"] / 3600.0

    def under_canopy(self, x, y):
        return sc.under_canopy(self.cfg, x, y)

    def step(self):
        """Call once per simulation step, after sup.step()."""
        self.n += 1
        h = self.garden_h()
        dt_h = h - self.last_h
        self.last_h = h
        ev = self.ev

        # ---- weather and events
        autan = ev["autan_start_h"] <= h < ev["autan_end_h"]
        rain = 0.0
        if not self.rain_done and h >= ev["rain_h"]:
            rain, self.rain_done = ev["rain_mm"], True
            self.print(f"[garden] h={h:.1f} rain {ev['rain_mm']} mm")
        if self.n % 5 == 0 or rain:
            self.soil.step(dt_h * (5 if not rain else 1), autan, rain)
        if not self.boar_done and h >= ev["boar"]["at_h"]:
            a = self.anchors[ev["boar"]["anchor"]]
            t = a.getField("translation").getSFVec3f()
            dx, dy = ev["boar"]["offset"]
            a.getField("translation").setSFVec3f([t[0] + dx, t[1] + dy, t[2]])
            a.getField("rotation").setSFRotation([1, 0, 0, 0.35])
            self.boar_done = True
            self.print(f"[garden] h={h:.1f} wild boar moved UWB anchor {ev['boar']['anchor']} "
                       f"by {math.hypot(dx, dy):.2f} m (its surveyed position is now wrong)")

        # ---- sun shortens IR range around midday (garden clock starts 06:00)
        if h - self.last_sun_h >= 0.25:
            self.last_sun_h = h
            hour = (6.0 + h) % 24.0
            sun = max(0.0, math.sin(math.pi * (hour - 6.0) / 12.0))
            for p in self.posts.values():
                p.getField("irRange").setSFFloat(3.0 - 1.6 * sun)

        # ---- per-rover sensing emulation, and the frame watch on the true position
        for name, node in self.rovers.items():
            x, y, z = node.getPosition()
            if "frame" in self.cfg and self.n % 3 == 0 and not in_frame(self.cfg, x, y):
                self.violations[name] += 1
                self.frame_log.writerow([round(self.sup.getTime(), 2), round(h, 3), name, round(x, 3), round(y, 3)])
                if self.violations[name] in (1, 100, 1000):
                    self.print(f"[garden] h={h:.1f} FRAME: {name} is outside the frame at ({x:.1f}, {y:.1f}) "
                               f"({self.violations[name]} samples so far)")
            uc = self.under_canopy(x, y)
            if uc != self.under[name]:
                self.under[name] = uc
                node.getField("gpsAccuracy").setSFFloat(2.5 if uc else 0.02)
            if self.n % 3:
                continue
            ranges = []
            for aid, a in self.anchors.items():
                ax, ay, az = a.getPosition()
                az += ANCHOR_H
                d = math.sqrt((x - ax) ** 2 + (y - ay) ** 2 + (z + 0.85 - az) ** 2)
                if d <= UWB_RANGE:
                    ranges.append([aid, round(d + self.rng.gauss(0, UWB_SIGMA), 3)])
            self.send(name, {"h": round(h, 4), "rtk": "float" if uc else "fix", "uwb": ranges,
                             "soil": round(self.soil.at(x, y) + self.rng.gauss(0, 0.4), 2)})

        # ---- periodic summary
        if h >= self.next_report_h:
            self.next_report_h += 6.0
            self.log_fh.flush()
            self.frame_fh.flush()
            for name, e in self.err_stats.items():
                if e:
                    self.print(f"[garden] h={h:.0f} {name}: position error mean {sum(e) / len(e):.2f} m, "
                               f"max {max(e):.2f} m ({len(e)} samples)")
                self.err_stats[name] = []

    def pose(self, m):
        """A rover reported its estimated pose: log it against ground truth."""
        if not m or m.get("name") not in self.rovers:
            return
        tx_, ty_, _ = self.rovers[m["name"]].getPosition()
        err = math.hypot(tx_ - m["x"], ty_ - m["y"])
        self.err_stats[m["name"]].append(err)
        self.log.writerow([round(self.sup.getTime(), 2), round(self.garden_h(), 3), m["name"], round(tx_, 3),
                           round(ty_, 3), round(m["x"], 3), round(m["y"], 3), round(m["sigma"], 3), round(err, 3),
                           m.get("state", "")])
