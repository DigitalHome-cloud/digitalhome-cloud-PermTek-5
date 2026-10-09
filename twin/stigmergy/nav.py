# SPDX-License-Identifier: GPL-3.0-or-later
"""Where a rover may drive, and how it gets there: the frame as a grid, and a contour-first planner.

The frame comes from the site file (people draw it, robots never discover it):
a geofence polygon and no-go areas. Known obstacles from the map (trees,
tank, nest, fascine rows except at their passages) and findings confirmed by
the store are added on top, inflated by the rover's half-width plus a margin.

The planner is A* on that grid. On a steep slope a rover should drive along
contours, climb only straight up the fall line, and never diagonally (it slides
downhill, lesson 6). The move cost encodes that; the path is then simplified
to waypoints that keep the same rule.

Pure Python, no shapely: this runs on the rover.
"""
import heapq
import math

from .vegetation import props as veg_props

RES = 0.5                 # m per cell
INFLATE = 0.55            # around obstacles: rover half-width (0.25 m) + margin
FENCE_MARGIN = 1.2        # from a geofence edge with the slope falling away outside it: a rover slides downhill
UPHILL_MARGIN = 0.8       # from an edge on the uphill side: sliding takes the rover away from it
DIAG_PENALTY = 3.0        # x grade x |sin 2 theta|: worst at 45 deg to the contour
CLIMB_COST = 2.0          # per metre of height gained
DESCEND_COST = 0.5        # per metre of height lost (braking on clay)
STRAIGHT = 0.35           # a segment is "along the contour" or "along the fall line" within this sine
SHORT_M = 2.0             # short segments may run in any direction


def point_in_poly(x, y, poly):
    inside = False
    n = len(poly)
    for i in range(n):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % n]
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    t = 0.0 if L2 == 0 else max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def poly_dist(x, y, poly):
    n = len(poly)
    return min(seg_dist(x, y, *poly[i], *poly[(i + 1) % n]) for i in range(n))


def in_no_go(x, y, area, margin=0.0):
    if "circle" in area:
        (cx, cy), r = area["circle"], area["r"]
        return math.hypot(x - cx, y - cy) < r + margin
    poly = area["polygon"]
    return point_in_poly(x, y, poly) or (margin > 0 and poly_dist(x, y, poly) < margin)


def in_frame(cfg, x, y):
    """True position check (no inflation): inside the geofence and outside every no-go area."""
    fr = cfg["frame"]
    return point_in_poly(x, y, fr["geofence"]) and not any(in_no_go(x, y, a) for a in fr["no_go"])


class NavGrid:
    def __init__(self, cfg, res=RES, inflate=INFLATE, fence_margin=FENCE_MARGIN):
        self.res, self.inflate = res, inflate
        fr = cfg["frame"]
        self.fence = [tuple(p) for p in fr["geofence"]]
        xs, ys = [p[0] for p in self.fence], [p[1] for p in self.fence]
        self.x0, self.y0 = min(xs) - res, min(ys) - res
        self.nx = int((max(xs) - self.x0) / res) + 2
        self.ny = int((max(ys) - self.y0) / res) + 2
        ux, uy = cfg["uphill"]
        self.up = (ux, uy)
        self.grade = cfg["terrain"]["grade"]
        self.edges = self._edge_margins(fence_margin)
        self.free = bytearray(self.nx * self.ny)
        for j in range(self.ny):
            y = self.y0 + (j + 0.5) * res
            for i in range(self.nx):
                x = self.x0 + (i + 0.5) * res
                if point_in_poly(x, y, self.fence) and all(seg_dist(x, y, *a, *b) >= m for a, b, m in self.edges):
                    self.free[j * self.nx + i] = 1
        for area in fr["no_go"]:
            self._block(area, fence_margin)
        self.frame_cells = bytes(self.free)                # the frame alone, before obstacles
        for ox, oy, r in cfg.get("obstacles", []):
            self.add_obstacle(ox, oy, r)
        self.cost = {}                                     # cell index -> move cost multiplier (vegetation)
        for v in cfg.get("vegetation", []):
            if "polygon" not in v:
                continue                                   # single plants are obstacles already
            veg = veg_props(v)
            area = {"polygon": v["polygon"]}
            if veg["drive"] == "block":
                self._block(area, inflate)                 # hedge, bramble, crop beds: never driven into
            elif veg["cost"] != 1.0:
                xs = [p[0] for p in v["polygon"]]
                ys = [p[1] for p in v["polygon"]]
                for i, j in self._cells_near(min(xs), min(ys), max(xs), max(ys)):
                    if point_in_poly(*self.center(i, j), v["polygon"]):
                        self.cost[j * self.nx + i] = veg["cost"]

    def _edge_margins(self, fence_margin):
        """Each geofence edge with its margin: the full margin where the ground falls away
        outside the edge (downhill), less where it rises (uphill), in between on the sides."""
        pts = self.fence
        area2 = sum(pts[i][0] * pts[(i + 1) % len(pts)][1] - pts[(i + 1) % len(pts)][0] * pts[i][1]
                    for i in range(len(pts)))
        ccw = area2 > 0
        out = []
        for i in range(len(pts)):
            a, b = pts[i], pts[(i + 1) % len(pts)]
            dx, dy = b[0] - a[0], b[1] - a[1]
            L = math.hypot(dx, dy) or 1e-9
            nx_, ny_ = (dy / L, -dx / L) if ccw else (-dy / L, dx / L)      # outward normal
            downhill = max(0.0, -(nx_ * self.up[0] + ny_ * self.up[1]))    # 1 = outside is straight downhill
            out.append((a, b, UPHILL_MARGIN + (fence_margin - UPHILL_MARGIN) * downhill))
        return out

    # ---------------------------------------------------------------- cells
    def cell(self, x, y):
        return int((x - self.x0) / self.res), int((y - self.y0) / self.res)

    def center(self, i, j):
        return self.x0 + (i + 0.5) * self.res, self.y0 + (j + 0.5) * self.res

    def is_free(self, i, j):
        return 0 <= i < self.nx and 0 <= j < self.ny and self.free[j * self.nx + i] == 1

    def _cells_near(self, x0, y0, x1, y1):
        i0, j0 = self.cell(x0, y0)
        i1, j1 = self.cell(x1, y1)
        for j in range(max(0, j0), min(self.ny, j1 + 1)):
            for i in range(max(0, i0), min(self.nx, i1 + 1)):
                yield i, j

    def _block(self, area, margin):
        if "circle" in area:
            (cx, cy), r = area["circle"], area["r"] + margin
            box = (cx - r, cy - r, cx + r, cy + r)
        else:
            xs = [p[0] for p in area["polygon"]]
            ys = [p[1] for p in area["polygon"]]
            box = (min(xs) - margin, min(ys) - margin, max(xs) + margin, max(ys) + margin)
        for i, j in self._cells_near(*box):
            if in_no_go(*self.center(i, j), area, margin):
                self.free[j * self.nx + i] = 0

    def add_obstacle(self, x, y, r):
        """A round obstacle (map, or a finding from the store): no cell within r + inflate."""
        self._block({"circle": [x, y], "r": r}, self.inflate)

    def nearest_free(self, x, y, max_r=4.0):
        i0, j0 = self.cell(x, y)
        if self.is_free(i0, j0):
            return i0, j0
        best = None
        k = int(max_r / self.res)
        for j in range(j0 - k, j0 + k + 1):
            for i in range(i0 - k, i0 + k + 1):
                if self.is_free(i, j):
                    d = (i - i0) ** 2 + (j - j0) ** 2
                    if best is None or d < best[0]:
                        best = (d, i, j)
        return None if best is None else (best[1], best[2])

    # ---------------------------------------------------------------- planning
    def move_cost(self, dx, dy):
        d = math.hypot(dx, dy)
        if d == 0:
            return 0.0
        u = (dx * self.up[0] + dy * self.up[1]) / d          # sine of the angle to the contour
        c = math.sqrt(max(0.0, 1 - u * u))
        dz = self.grade * u * d
        return (d * (1 + DIAG_PENALTY * self.grade * 2 * abs(u) * c)
                + (CLIMB_COST * dz if dz > 0 else -DESCEND_COST * dz))

    def reachable(self, start_xy):
        """Every free cell reachable from start (set of (i, j))."""
        s = self.nearest_free(*start_xy)
        if s is None:
            return set()
        seen, stack = {s}, [s]
        while stack:
            i, j = stack.pop()
            for di in (-1, 0, 1):
                for dj in (-1, 0, 1):
                    n = (i + di, j + dj)
                    if n not in seen and self.is_free(*n):
                        seen.add(n)
                        stack.append(n)
        return seen

    def plan(self, start_xy, goal_xy):
        """Waypoints from start to goal (goal included), or None when the goal cannot be reached."""
        s = self.nearest_free(*start_xy)
        g = self.nearest_free(*goal_xy)
        if s is None or g is None:
            return None
        gx, gy = self.center(*g)
        open_, came, cost = [(0.0, s)], {s: None}, {s: 0.0}
        while open_:
            _, cur = heapq.heappop(open_)
            if cur == g:
                break
            ci, cj = cur
            for di in (-1, 0, 1):
                for dj in (-1, 0, 1):
                    if di == dj == 0:
                        continue
                    n = (ci + di, cj + dj)
                    if not self.is_free(*n):
                        continue
                    if di and dj and not (self.is_free(ci + di, cj) and self.is_free(ci, cj + dj)):
                        continue                                  # no corner cutting
                    c = cost[cur] + self.move_cost(di * self.res, dj * self.res) * self.cost.get(n[1] * self.nx + n[0], 1.0)
                    if c < cost.get(n, float("inf")):
                        cost[n] = c
                        came[n] = cur
                        nx_, ny_ = self.center(*n)
                        heapq.heappush(open_, (c + math.hypot(gx - nx_, gy - ny_), n))
        if g not in came:
            return None
        cells = []
        n = g
        while n is not None:
            cells.append(n)
            n = came[n]
        cells.reverse()
        pts = self._simplify([self.center(*c) for c in cells])
        return pts[1:-1] + [tuple(goal_xy)] if len(pts) > 1 else [tuple(goal_xy)]

    def line_free(self, a, b):
        L = math.hypot(b[0] - a[0], b[1] - a[1])
        n = max(1, int(L / (self.res * 0.5)))
        return all(self.is_free(*self.cell(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n))
                   for k in range(n + 1))

    def good_direction(self, a, b):
        dx, dy = b[0] - a[0], b[1] - a[1]
        d = math.hypot(dx, dy)
        if d <= SHORT_M or self.grade < 0.15:
            return True
        u = abs(dx * self.up[0] + dy * self.up[1]) / d
        return u < STRAIGHT or math.sqrt(max(0.0, 1 - u * u)) < STRAIGHT

    def _simplify(self, pts):
        out, i = [pts[0]], 0
        while i < len(pts) - 1:
            j = len(pts) - 1
            while j > i + 1 and not (self.line_free(pts[i], pts[j]) and self.good_direction(pts[i], pts[j])):
                j -= 1
            out.append(pts[j])
            i = j
        return out

    def drivable(self, x, y):
        return self.is_free(*self.cell(x, y))

    def in_frame_margin(self, x, y):
        """Inside the geofence with its margin and out of no-go areas (obstacles do not count)."""
        i, j = self.cell(x, y)
        return 0 <= i < self.nx and 0 <= j < self.ny and self.frame_cells[j * self.nx + i] == 1
