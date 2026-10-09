# SPDX-License-Identifier: GPL-3.0-or-later
"""Shared logic for the permaculture stigmergy test bed (no Webots imports here,
so everything in this file can be unit-tested outside the simulator).

Contents
  - site config loading and the rover's terrain model (surveyed plane)
  - the 32-bit IR frame used between posts and rovers
  - read-time decay (half-life weights)
  - UWB multilateration with leave-one-out outlier detection
  - a local trace store that merges with other agents' stores at the nest
  - the soil-moisture field the supervisor simulates
"""
import glob
import json
import math
import os

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))   # the twin project
DATA_DIR = os.path.join(ROOT, "data")


def load_config():
    with open(os.path.join(ROOT, "site_config.json")) as fh:
        return json.load(fh)


def plane_z(cfg, x, y):
    """Terrain height as the rover knows it: the surveyed slope plane only (local z)."""
    t = cfg["terrain"]
    return t["z_ref"] + t["grad"][0] * (x - t["ref"][0]) + t["grad"][1] * (y - t["ref"][1])


def wrap(a):
    return (a + math.pi) % (2 * math.pi) - math.pi


# ------------------------------------------------------------------ paths
def _intersect(p, q, a, b):
    """Parameters (t along p->q, u along a->b) of the crossing point, or None."""
    rx, ry = q[0] - p[0], q[1] - p[1]
    sx, sy = b[0] - a[0], b[1] - a[1]
    den = rx * sy - ry * sx
    if abs(den) < 1e-9:
        return None
    t = ((a[0] - p[0]) * sy - (a[1] - p[1]) * sx) / den
    u = ((a[0] - p[0]) * ry - (a[1] - p[1]) * rx) / den
    if 0.0 <= t <= 1.0 and 0.0 <= u <= 1.0:
        return t, u
    return None


def plan_path(cfg, start, goal, margin=1.0, clear=1.8):
    """Waypoints from start to goal that cross contour lines (fascines) only at their passages.
    Each fascine is treated as a wall (extended by `margin` at both ends);
    a crossing is entered and left `clear` metres from the swale line."""
    ux, uy = cfg["uphill"]
    walls = []
    for s in cfg["contours"]:
        (ax, ay), (bx, by) = s["a"], s["b"]
        L = math.hypot(bx - ax, by - ay)
        ex, ey = (bx - ax) / L * margin, (by - ay) / L * margin
        walls.append(((ax - ex, ay - ey), (bx + ex, by + ey), s))
    wps, cur = [], tuple(start)
    for _ in range(len(walls) + 1):
        hits = []
        for a, b, s in walls:
            r = _intersect(cur, goal, a, b)
            if r:
                hits.append((r[0], a, b, s))
        if not hits:
            break
        t, a, b, s = min(hits, key=lambda h: h[0])
        hx, hy = cur[0] + t * (goal[0] - cur[0]), cur[1] + t * (goal[1] - cur[1])
        cx, cy = min(s["crossings"], key=lambda c: math.hypot(c[0] - hx, c[1] - hy))
        side = 1.0 if (cur[0] - s["a"][0]) * ux + (cur[1] - s["a"][1]) * uy > 0 else -1.0
        before = (cx + side * clear * ux, cy + side * clear * uy)
        after = (cx - side * clear * ux, cy - side * clear * uy)
        wps += [before, after]
        cur = after
    wps.append(tuple(goal))
    return detour(start, wps, cfg.get("obstacles", []))


def _seg_point(p, q, c):
    dx, dy = q[0] - p[0], q[1] - p[1]
    L2 = dx * dx + dy * dy or 1e-9
    t = ((c[0] - p[0]) * dx + (c[1] - p[1]) * dy) / L2
    tc = max(0.0, min(1.0, t))
    return math.hypot(p[0] + tc * dx - c[0], p[1] + tc * dy - c[1]), t


def detour(start, wps, obstacles, clear=0.8):
    """Insert side waypoints so no leg passes closer than r + clear to a known obstacle."""
    out, cur, queue = [], tuple(start), [tuple(w) for w in wps]
    for _ in range(60):
        if not queue:
            break
        nxt = queue[0]
        worst = None
        for ox, oy, r in obstacles:
            d, t = _seg_point(cur, nxt, (ox, oy))
            if (0.0 < t < 1.0 and d < r + clear and math.hypot(nxt[0] - ox, nxt[1] - oy) > r + 0.3
                    and math.hypot(cur[0] - ox, cur[1] - oy) > r + 0.3):
                if worst is None or t < worst[0]:
                    worst = (t, ox, oy, r)
        if worst:
            _, ox, oy, r = worst
            L = math.hypot(nxt[0] - cur[0], nxt[1] - cur[1]) or 1e-9
            nx, ny = -(nxt[1] - cur[1]) / L, (nxt[0] - cur[0]) / L
            side = 1.0 if (ox - cur[0]) * nx + (oy - cur[1]) * ny > 0 else -1.0
            k = r + clear + 0.5
            queue.insert(0, (ox - side * nx * k, oy - side * ny * k))
        else:
            cur = queue.pop(0)
            out.append(cur)
    return out + queue


# ------------------------------------------------------------------ IR frame
# 32 bits: post id (8) | type (4) | value (16) | checksum (4, xor of nibbles)
T_STATUS = 1      # post -> rover: garden minutes since last inspection (0xFFFF = never)
T_MOIST = 2       # post -> rover: last soil moisture written, in 0.1 %
T_WRITE = 3       # rover -> post: "inspected now", value = soil moisture in 0.1 %
NEVER = 0xFFFF


def _checksum(v28):
    x = 0
    for k in range(7):
        x ^= (v28 >> (4 * k)) & 0xF
    return x


def encode_frame(post_id, ftype, value):
    value = max(0, min(0xFFFF, int(round(value))))
    v = ((post_id & 0xFF) << 20) | ((ftype & 0xF) << 16) | value
    return ((v << 4) | _checksum(v)).to_bytes(4, "big")


def decode_frame(data):
    if data is None or len(data) != 4:
        return None
    w = int.from_bytes(data, "big")
    v = w >> 4
    if _checksum(v) != (w & 0xF):
        return None
    return (v >> 20) & 0xFF, (v >> 16) & 0xF, v & 0xFFFF


# ------------------------------------------------------------------ decay
def weight(age_h, half_life_h):
    """How much a trace of this age still counts (1 = fresh, 0.5 = one half-life)."""
    if age_h is None:
        return 0.0
    return 0.5 ** (max(0.0, age_h) / half_life_h)


# ------------------------------------------------------------------ UWB
def _solve(ms, x0=None, y0=None):
    """ms: list of (id, ax, ay, r_horizontal). Linear LS start + Gauss-Newton."""
    if len(ms) < 3:
        return None
    if x0 is None:
        _, x1, y1, r1 = ms[0]
        a11 = a12 = a22 = b1 = b2 = 0.0
        for _, xi, yi, ri in ms[1:]:
            a = 2 * (xi - x1)
            c = 2 * (yi - y1)
            rhs = r1 * r1 - ri * ri + xi * xi - x1 * x1 + yi * yi - y1 * y1
            a11 += a * a
            a12 += a * c
            a22 += c * c
            b1 += a * rhs
            b2 += c * rhs
        det = a11 * a22 - a12 * a12
        if abs(det) < 1e-6:
            return None
        x0 = (a22 * b1 - a12 * b2) / det
        y0 = (a11 * b2 - a12 * b1) / det
    x, y = x0, y0
    for _ in range(8):
        j11 = j12 = j22 = g1 = g2 = 0.0
        for _, xi, yi, ri in ms:
            d = max(1e-6, math.hypot(x - xi, y - yi))
            ux, uy = (x - xi) / d, (y - yi) / d
            e = d - ri
            j11 += ux * ux
            j12 += ux * uy
            j22 += uy * uy
            g1 += ux * e
            g2 += uy * e
        det = j11 * j22 - j12 * j12
        if abs(det) < 1e-9:
            break
        dx = (j22 * g1 - j12 * g2) / det
        dy = (j11 * g2 - j12 * g1) / det
        x -= dx
        y -= dy
        if abs(dx) + abs(dy) < 1e-4:
            break
    res = [math.hypot(x - xi, y - yi) - ri for _, xi, yi, ri in ms]
    rms = math.sqrt(sum(r * r for r in res) / len(res))
    return x, y, rms


def uwb_fix(ms, good_rms=0.2):
    """Position from ranges. Returns (x, y, rms, outlier_id or None) or None.
    With 4+ anchors, an inconsistent anchor is found by leaving each one out."""
    sol = _solve(ms)
    if sol is None:
        return None
    if sol[2] <= good_rms or len(ms) < 4:
        return sol[0], sol[1], sol[2], None
    best = None
    for k in range(len(ms)):
        sub = ms[:k] + ms[k + 1:]
        s = _solve(sub)
        if s and (best is None or s[2] < best[0][2]):
            best = (s, ms[k][0])
    if best and best[0][2] <= good_rms:
        return best[0][0], best[0][1], best[0][2], best[1]
    return sol[0], sol[1], sol[2], None


# ------------------------------------------------------------------ store
class Store:
    """Each agent appends its own traces to data/store_<agent>.jsonl.
    sync() reads every agent's file: that is what happens at the nest,
    where stores are replicated. Nothing is ever deleted; decay is applied
    when a trace is read."""

    def __init__(self, agent, data_dir=DATA_DIR, fresh=True):
        self.agent = agent
        self.dir = data_dir
        os.makedirs(self.dir, exist_ok=True)
        self.path = os.path.join(self.dir, f"store_{agent}.jsonl")
        if fresh and os.path.exists(self.path):
            os.remove(self.path)
        self.seq = 0
        self.known = {}

    def write(self, rec):
        self.seq += 1
        rec = dict(rec, agent=self.agent, seq=self.seq)
        with open(self.path, "a") as fh:
            fh.write(json.dumps(rec) + "\n")
        self.known[(self.agent, self.seq)] = rec
        return rec

    def sync(self):
        n_before = len(self.known)
        for p in glob.glob(os.path.join(self.dir, "store_*.jsonl")):
            try:
                with open(p) as fh:
                    for line in fh:
                        line = line.strip()
                        if line:
                            r = json.loads(line)
                            self.known[(r["agent"], r["seq"])] = r
            except (OSError, ValueError):
                pass   # a file being written right now; next sync will catch it
        return len(self.known) - n_before

    def records(self, rtype=None, **match):
        for r in self.known.values():
            if rtype and r.get("type") != rtype:
                continue
            if all(r.get(k) == v for k, v in match.items()):
                yield r

    def last_visit_h(self, post_id):
        ts = [r["t_h"] for r in self.records("visit", post=post_id)]
        return max(ts) if ts else None

    def active_claims(self, now_h, exclude_agent=None, key="post"):
        """What others hold right now: {post id (or cell id, key="cell"): agent}."""
        out = {}
        for r in self.records("claim"):
            if key in r and r["expires_h"] > now_h and r["agent"] != exclude_agent:
                out[r[key]] = r["agent"]
        released = {(r[key], r["agent"]) for r in self.records("release") if key in r}
        return {p: a for p, a in out.items() if (p, a) not in released}


# ------------------------------------------------------------------ canopy
def _in_poly(x, y, poly):
    inside, n = False, len(poly)
    for i in range(n):
        (x1, y1), (x2, y2) = poly[i], poly[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def under_canopy(cfg, x, y):
    """Under a tree's crown or in a wood: shade, and satellite positioning degrades."""
    if any(math.hypot(x - o["pos"][0], y - o["pos"][1]) < o["canopy_r"] for o in cfg.get("canopies", cfg["oaks"])):
        return True
    return any(v["class"] == "tree" and "polygon" in v and _in_poly(x, y, v["polygon"])
               for v in cfg.get("vegetation", []))


# ------------------------------------------------------------------ soil
def seg_dist(p, a, b):
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    t = max(0.0, min(1.0, ((p[0] - ax) * dx + (p[1] - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(p[0] - (ax + t * dx), p[1] - (ay + t * dy))


class SoilField:
    """Volumetric soil moisture (%) at ~10 cm on a 2 m grid.
    Dries faster under autan, slower in oak shade, stays wetter just uphill of fascines
    and near the pond. Rain adds water. Deliberately simple."""

    CELL = 2.0

    def __init__(self, cfg, start=17.0):
        self.x0, self.y0, x1, y1 = cfg["bbox"]
        self.nx = int((x1 - self.x0) / self.CELL) + 1
        self.ny = int((y1 - self.y0) / self.CELL) + 1
        self.m = []
        self.k = []          # drying factor per cell
        for j in range(self.ny):
            for i in range(self.nx):
                x = self.x0 + (i + 0.5) * self.CELL
                y = self.y0 + (j + 0.5) * self.CELL
                m, k = start, 1.0
                if any(seg_dist((x, y), s["a"], s["b"]) < 2.5 for s in cfg["contours"]):
                    m, k = start + 5.0, 0.7
                if under_canopy(cfg, x, y):
                    k *= 0.6
                pc = cfg["pond"]["center"]
                if math.hypot(x - pc[0], y - pc[1]) < cfg["pond"]["radius"] + 3:
                    m, k = start + 8.0, 0.5
                self.m.append(m)
                self.k.append(k)

    def step(self, dt_h, autan=False, rain_mm=0.0):
        rate = 0.30 if autan else 0.05          # %-points per hour at 25 %
        for n in range(len(self.m)):
            m = self.m[n] - rate * self.k[n] * dt_h * (self.m[n] / 25.0) + 0.6 * rain_mm
            self.m[n] = max(3.0, min(40.0, m))

    def at(self, x, y):
        i = int((x - self.x0) / self.CELL)
        j = int((y - self.y0) / self.CELL)
        i = max(0, min(self.nx - 1, i))
        j = max(0, min(self.ny - 1, j))
        return self.m[j * self.nx + i]
