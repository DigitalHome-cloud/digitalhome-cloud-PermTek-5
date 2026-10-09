#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Generate the Webots world of a permaculture site from a site file.

Run from the project root:
    python3 tools/generate_world.py                       # PermaDemo
    python3 tools/generate_world.py --site <name>         # another site under sites/
    python3 tools/generate_world.py --site path/to/site.json
Needs: Python 3, shapely, Pillow  (pip install shapely pillow)

The site file (see sites/permademo/site.json) describes the site in local metres:
  - garden parts A and B; zones 1/2/3 are cut from A by area along an axis
  - terrain = a plane through a high and a low point, plus levelled pads for
    the tank and the pond. Not surveyed.
  - fascines on contour in zone 2 (slope > 15 % on clay -> fascines instead
    of swales), each with passages for rovers
  - house, optional pool, pond, oaks, orchard trees, IR posts, UWB anchors
  - optional ground image (a site plan) with its scale; otherwise the ground
    texture is drawn from the zones
  - the frame people drew: geofence (default: the garden outline) and no-go
    areas; every post and the nest must be reachable inside it, or this stops
  - hidden objects (rocks, branches): in the world, but not in the rovers' map,
    so exploration has something to find (listed in worlds/truth.json)

Real sites stay out of this repository: keep their site file and plan in a
private place and pass --site. Everything this writes is a generated output
(ignored by git):
  worlds/site.wbt (or site_ros.wbt with --ros), worlds/textures/ground.jpg, site_config.json
Local frame: ENU metres, x = east, y = north, z = elevation - z_offset.
"""
import argparse
import json
import math
import os
import sys

from PIL import Image, ImageDraw
from shapely.geometry import LineString, Point, Polygon
from shapely.ops import unary_union

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)
from stigmergy.nav import NavGrid  # noqa: E402
from stigmergy.vegetation import props as veg_props  # noqa: E402
SITES = os.path.join(ROOT, "sites")
DEFAULT_SITE = "permademo"


def site_path(name_or_path):
    """A site by name (a folder under sites/) or a path to a site file."""
    p = os.path.join(SITES, name_or_path, "site.json")
    return p if os.path.isfile(p) else name_or_path


def generate(site_path, ros=False):
    site_dir = os.path.dirname(os.path.abspath(site_path))
    with open(site_path) as fh:
        site = json.load(fh)

    Z_OFFSET = site.get("z_offset", 0.0)        # local z = elevation - z_offset
    TIME_SCALE = site.get("time_scale", 120)

    def poly(pts):
        return Polygon(pts)

    g = site["garden"]
    ZONE_A = poly(g["a"])
    ZONE_B = poly(g["b"])
    TERRAIN = site["terrain"]

    # -------------------------------------------------------------- elevation
    HX, HY = TERRAIN["high"]["pos"]
    BX, BY = TERRAIN["low"]["pos"]
    Z_HIGH = TERRAIN["high"]["z"]
    L = math.hypot(HX - BX, HY - BY)
    DOWN = ((BX - HX) / L, (BY - HY) / L)                 # unit vector downhill
    UP = (-DOWN[0], -DOWN[1])
    CONTOUR = (-UP[1], UP[0])                             # along the contour
    GRADE = (Z_HIGH - TERRAIN["low"]["z"]) / L
    GX, GY = UP[0] * GRADE, UP[1] * GRADE                 # dz/dx, dz/dy

    def plane_z(x, y):
        return Z_HIGH + GX * (x - HX) + GY * (y - HY)

    PADS = []        # (x, y, flat radius, blend width, z)
    PONDS = []
    BENCHES = []     # flat strips along the contour: (a, b, d0, d1, blend_d, blend_t, z, passages)

    def bench_z(x, y, z):
        for a, b, d0, d1, bd, bt, zb, passages in BENCHES:
            lx, ly = b[0] - a[0], b[1] - a[1]
            ln = math.hypot(lx, ly)
            tx, ty = lx / ln, ly / ln
            t = (x - a[0]) * tx + (y - a[1]) * ty
            d = (x - a[0]) * UP[0] + (y - a[1]) * UP[1]
            if d < d0 or d > d1 + bd or t < -bt or t > ln + bt:
                continue
            wd = 1.0 if d <= d1 else 0.5 * (1 + math.cos(math.pi * (d - d1) / bd))
            wt = 1.0
            if t < 0:
                wt = 0.5 * (1 + math.cos(math.pi * -t / bt))
            elif t > ln:
                wt = 0.5 * (1 + math.cos(math.pi * (t - ln) / bt))
            for tc, half in passages:
                e = abs(t - tc)
                if e < half:
                    wt = 0.0
                elif e < half + 1.0:
                    wt *= 0.5 * (1 - math.cos(math.pi * (e - half) / 1.0))
            w = wd * wt
            z = w * zb + (1 - w) * z
        return z

    def ground_z(x, y):
        z = plane_z(x, y)
        for px_, py_, r, blend, zp in PADS:
            d = math.hypot(x - px_, y - py_)
            if d <= r:
                z = zp
            elif d < r + blend:
                w = 0.5 * (1 + math.cos(math.pi * (d - r) / blend))
                z = w * zp + (1 - w) * z
        z = bench_z(x, y, z)
        for pc, pr, depth in PONDS:
            d = math.hypot(x - pc[0], y - pc[1])
            if d < pr:
                z -= depth * min(1.0, (pr - d) / 0.6)
        return z

    # -------------------------------------------------------------- zones 1/2/3 by area
    AXIS_A, AXIS_B = g["axis"]

    def cut(polygon, t0, t1):
        """Part of polygon between two lines perpendicular to the A axis (t in 0..1)."""
        ax, ay = AXIS_A
        dx, dy = AXIS_B[0] - ax, AXIS_B[1] - ay
        n = (-dy, dx)
        big = 500
        p0 = (ax + t0 * dx, ay + t0 * dy)
        p1 = (ax + t1 * dx, ay + t1 * dy)
        strip = Polygon([(p0[0] + n[0] * big, p0[1] + n[1] * big), (p0[0] - n[0] * big, p0[1] - n[1] * big),
                         (p1[0] - n[0] * big, p1[1] - n[1] * big), (p1[0] + n[0] * big, p1[1] + n[1] * big)])
        return polygon.intersection(strip)

    def find_t(target, from_end):
        lo, hi = 0.0, 1.0
        for _ in range(60):
            mid = (lo + hi) / 2
            a = cut(ZONE_A, mid, 1.2).area if from_end else cut(ZONE_A, -0.2, mid).area
            if (a > target) == from_end:
                lo = mid
            else:
                hi = mid
        return (lo + hi) / 2

    # targets are scaled by the trace error, so a traced outline still splits in the planned ratio
    a_expected = g.get("a_expected_m2")
    b_expected = g.get("b_expected_m2")
    area_scale = ZONE_A.area / a_expected if a_expected else 1.0
    T1 = find_t(g["zone_areas_m2"]["zone1"] * area_scale, from_end=True)     # zone 1 = the B end of the axis
    T3 = find_t(g["zone_areas_m2"]["zone3"] * area_scale, from_end=False)    # zone 3 = the A end
    lab = g["labels"]
    ZONES = {
        "zone1": (lab["zone1"], cut(ZONE_A, T1, 1.2)),
        "zone2": (lab["zone2"], cut(ZONE_A, T3, T1)),
        "zone3": (lab["zone3"], cut(ZONE_A, -0.2, T3)),
        "zone4": (lab["zone4"], ZONE_B),
    }
    GARDEN = unary_union([ZONE_A.buffer(0.6, join_style=2), ZONE_B.buffer(0.6, join_style=2)]).buffer(-0.6, join_style=2)
    FENCE = GARDEN.buffer(0.8, join_style=2)

    # -------------------------------------------------------------- nest, tank, pond (pads)
    z1c = ZONES["zone1"][1].centroid
    # the rover approaches the nest along the contour, heading DOCK_DIR (towards the zone 1 tip)
    DOCK_DIR = CONTOUR if (CONTOUR[0] * (AXIS_B[0] - AXIS_A[0]) + CONTOUR[1] * (AXIS_B[1] - AXIS_A[1])) > 0 else (-CONTOUR[0], -CONTOUR[1])
    DOCK_YAW = math.atan2(DOCK_DIR[1], DOCK_DIR[0])
    NEST = {"center": [z1c.x + 2.0 * DOCK_DIR[0], z1c.y + 2.0 * DOCK_DIR[1]], "size": [1.2, 2.4, 1.0],
            "yaw": DOCK_YAW}
    _inner = unary_union([ZONE_A.buffer(0.6, join_style=2), ZONE_B.buffer(0.6, join_style=2)]).buffer(-0.6 - 1.8)
    _best = None
    for _k in range(0, 61):                      # highest spot near the nest that keeps the tank 1.8 m inside the fence
        for _a in range(-30, 31, 2):
            _px = z1c.x + 0.1 * _k * UP[0] + 0.1 * _a * DOCK_DIR[0]
            _py = z1c.y + 0.1 * _k * UP[1] + 0.1 * _a * DOCK_DIR[1]
            if _inner.contains(Point(_px, _py)) and math.hypot(_px - NEST["center"][0], _py - NEST["center"][1]) > 3.2:
                if _best is None or plane_z(_px, _py) > plane_z(*_best):
                    _best = (_px, _py)
    if _best is None:
        raise SystemExit("no place for the tank in zone 1: make zone 1 larger")
    TANK = {"center": [round(_best[0], 2), round(_best[1], 2)], "radius": 1.3, "height": 2.2}
    # no levelled pad for the nest: the rover docks along the contour, so it only rolls sideways, never climbs
    PADS.append((TANK["center"][0], TANK["center"][1], 1.8, 1.5, plane_z(*TANK["center"]) + 0.2))
    POND_C = tuple(site["pond"]["pos"])
    POND = {"center": list(POND_C), "radius": site["pond"]["radius"], "depth": site["pond"]["depth"]}
    PADS.append((POND_C[0], POND_C[1], POND["radius"] + 0.8, 2.5, plane_z(*POND_C)))
    PONDS.append((POND_C, POND["radius"], POND["depth"]))

    _back = NEST["size"][0] / 2 + 0.15 + 0.26
    DOCKS = {}
    for _name, _off in (("rover1", -0.8), ("rover2", 0.8)):
        DOCKS[_name] = [round(NEST["center"][0] - _back * DOCK_DIR[0] + _off * UP[0], 3),
                        round(NEST["center"][1] - _back * DOCK_DIR[1] + _off * UP[1], 3), round(DOCK_YAW, 4)]

    # -------------------------------------------------------------- fascines (zone 2)
    CROSS_HALF = 1.2                 # passages 2.4 m wide
    z2 = ZONES["zone2"][1]
    z2_in = z2.buffer(-1.5)
    proj = [(x - HX) * UP[0] + (y - HY) * UP[1] for x, y in z2.exterior.coords]
    lo_u, hi_u = min(proj), max(proj)
    CONTOURS = []
    for k in range(3):
        u = lo_u + (hi_u - lo_u) * (k + 1) / 4
        cx, cy = HX + u * UP[0], HY + u * UP[1]
        line = LineString([(cx - 200 * CONTOUR[0], cy - 200 * CONTOUR[1]),
                           (cx + 200 * CONTOUR[0], cy + 200 * CONTOUR[1])]).intersection(z2_in)
        if line.is_empty:
            continue
        if line.geom_type != "LineString":
            line = max(line.geoms, key=lambda gm: gm.length)
        (ax, ay), (bx, by) = line.coords[0], line.coords[-1]
        fracs = (0.3, 0.7) if line.length >= 14 else (0.5,)        # short fascine: one passage
        crossings = [list(line.interpolate(fr, normalized=True).coords[0]) for fr in fracs]
        CONTOURS.append({"name": f"fascine_{k + 1}", "a": [round(ax, 2), round(ay, 2)],
                         "b": [round(bx, 2), round(by, 2)],
                         "crossings": [[round(c[0], 2), round(c[1], 2)] for c in crossings],
                         "height": 0.3, "length": round(line.length, 1)})

    # fruit trees just uphill of each fascine (soil accumulates there), avoiding passages
    TREE_UPHILL = site.get("fascine_tree_offset_m", 0.8)
    TREES = []
    for i, c in enumerate(CONTOURS):
        line = LineString([c["a"], c["b"]])
        n_trees = max(3, int(line.length // 4))
        for j in range(n_trees):
            p = line.interpolate((j + 0.5) / n_trees, normalized=True)
            if min(math.hypot(p.x - q[0], p.y - q[1]) for q in c["crossings"]) < 2.5:
                continue
            TREES.append({"name": f"fruit_f{i + 1}_{j + 1}", "pos": [round(p.x + TREE_UPHILL * UP[0], 2),
                          round(p.y + TREE_UPHILL * UP[1], 2)], "trunk": 0.08, "height": 2.8, "canopy": 1.4,
                          "zone": "zone2", "line": i})
    for t in site.get("orchard", []):
        x, y = t["pos"]
        TREES.append({"name": t["name"], "pos": [round(x, 2), round(y, 2)], "trunk": t.get("trunk", 0.12),
                      "height": t["height"], "canopy": t["canopy"], "zone": t.get("zone", "zone4")})

    OAKS = [list(p) for p in site.get("oaks", [])]
    OAK_CANOPY = site.get("oak_canopy_m", 3.5)

    # -------------------------------------------------------------- vegetation map (perma:VegetationUnit)
    VEG = site.get("vegetation", [])
    CANOPIES = [{"pos": [round(x, 2), round(y, 2)], "canopy_r": OAK_CANOPY} for x, y in OAKS]
    SHRUBS = []          # (x, y, r, h, colour): round solid vegetation that is not a tree
    PATCH_BOXES = []     # (x, y, h, colour): hedges and bramble filled with 1 m boxes
    for v in VEG:
        vp = veg_props(v)
        if "circle" in v:
            x, y = v["circle"]
            h = v.get("height_m", 5.0)
            if v["class"] == "tree":
                cr = v.get("canopy_r", 2.5)
                TREES.append({"name": v["id"], "pos": [round(x, 2), round(y, 2)],
                              "trunk": v.get("trunk", 0.35 if h >= 7 else 0.12), "height": h, "canopy": cr,
                              "zone": v.get("zone", "")})
                if v.get("canopy"):
                    CANOPIES.append({"pos": [round(x, 2), round(y, 2)], "canopy_r": cr})
            elif vp["solid"]:
                SHRUBS.append((x, y, v.get("r", 1.0), h, vp["colour"]))
        elif vp["solid"]:
            pg = Polygon(v["polygon"])
            bx0, by0, bx1, by1 = pg.bounds
            yy = by0 + 0.5
            while yy < by1:
                xx = bx0 + 0.5
                while xx < bx1:
                    if pg.contains(Point(xx, yy)):
                        PATCH_BOXES.append((xx, yy, v.get("height_m", 1.5), vp["colour"]))
                    xx += 1.0
                yy += 1.0

    # -------------------------------------------------------------- IR posts and UWB anchors
    STATIC_OBS = ([(x, y, 0.4) for x, y in OAKS] + [(t["pos"][0], t["pos"][1], t["trunk"]) for t in TREES] +
                  [(x, y, r) for x, y, r, _, _ in SHRUBS] +
                  [(TANK["center"][0], TANK["center"][1], TANK["radius"]), (NEST["center"][0], NEST["center"][1], 1.0),
                   (POND_C[0], POND_C[1], POND["radius"] + 0.8)])

    fr = site.get("frame", {})
    frame_grid = NavGrid({"frame": {"geofence": fr.get("geofence", [list(p) for p in GARDEN.exterior.coords][:-1]),
                                    "no_go": fr.get("no_go", [])},
                          "uphill": list(UP), "terrain": {"grade": GRADE}, "obstacles": []})

    def stand_point(x, y):
        """Where a rover parks to read a post: 1.1 m away, inside the frame's margins, clear of obstacles,
        preferring a spot on the same contour (no pitch while reading)."""
        best = None
        for k in range(16):
            a = 2 * math.pi * k / 16
            sx, sy = x + 1.1 * math.cos(a), y + 1.1 * math.sin(a)
            if not frame_grid.in_frame_margin(sx, sy):        # where the rovers may drive (nav: margins by slope)
                continue
            clear = min(math.hypot(sx - ox, sy - oy) - r for ox, oy, r in STATIC_OBS)
            clear = min(clear, min(Point(sx, sy).distance(LineString([c["a"], c["b"]])) for c in CONTOURS) - 0.2)
            along = abs(math.cos(a) * CONTOUR[0] + math.sin(a) * CONTOUR[1])
            score = min(clear, 1.5) + 0.5 * along
            if clear > 0.5 and (best is None or score > best[0]):
                best = (score, sx, sy)
        if best is None:
            raise SystemExit(f"no clear stand point next to the post at ({x:.1f}, {y:.1f})")
        return [round(best[1], 2), round(best[2], 2)]

    def next_to(tree, d=1.0):
        x, y = tree["pos"]
        return x + d * CONTOUR[0], y + d * CONTOUR[1]

    tr = {t["name"]: t for t in TREES}
    mid_of_line = []
    for i in range(len(CONTOURS)):
        on_line = [t for t in TREES if t.get("line") == i]
        mid_of_line.append(on_line[len(on_line) // 2])
    POSTS = []
    for pid, p in enumerate(site["posts"], start=1):
        if "near_tree" in p:
            x, y = next_to(tr[p["near_tree"]])
        elif "near_fascine" in p:
            x, y = next_to(mid_of_line[p["near_fascine"] - 1])
        else:                        # a point on the zone's edge, moved inward
            zg = ZONES[p["zone"]][1]
            e = Point(zg.exterior.interpolate(zg.exterior.project(Point(*p["zone_edge"]))).coords[0])
            inward = (zg.centroid.x - e.x, zg.centroid.y - e.y)
            nrm = math.hypot(*inward)
            x, y = e.x + p.get("inset", 2.5) * inward[0] / nrm, e.y + p.get("inset", 2.5) * inward[1] / nrm
        POSTS.append((pid, p["label"], p["zone"], x, y))
    STATIC_OBS += [(x, y, 0.05) for _, _, _, x, y in POSTS]

    c3 = ZONES["zone3"][1].centroid
    ANCHORS = []
    for k, (x, y) in enumerate(site["anchors"]):     # each anchor moved 1.2 m from its seed towards zone 3
        v = (c3.x - x, c3.y - y)
        d = math.hypot(*v)
        ANCHORS.append((k + 1, round(x + 1.2 * v[0] / d, 2), round(y + 1.2 * v[1] / d, 2)))
    ANCHOR_HEIGHT = 1.5
    STATIC_OBS += [(x, y, 0.05) for _, x, y in ANCHORS]      # surveyed: part of the map

    EVENTS = site.get("events", {"autan_start_h": 2.0, "autan_end_h": 30.0, "rain_h": 36.0, "rain_mm": 12.0,
                                 "boar": {"at_h": 10.0, "anchor": 3, "offset": [1.2, -0.8]}})
    HALF_LIVES_H = {"soilMoisture": 12.0, "visit": 12.0, "airTemperature": 0.5, "phenology": 120.0}

    # -------------------------------------------------------------- VRML helpers
    def f(v):
        return f"{v:.4f}".rstrip("0").rstrip(".") if isinstance(v, float) else str(v)

    def quat_mul(a, b):
        w1, x1, y1, z1 = a
        w2, x2, y2, z2 = b
        return (w1 * w2 - x1 * x2 - y1 * y2 - z1 * z2, w1 * x2 + x1 * w2 + y1 * z2 - z1 * y2,
                w1 * y2 - x1 * z2 + y1 * w2 + z1 * x2, w1 * z2 + x1 * y2 - y1 * x2 + z1 * w2)

    def axis_angle(q):
        w, x, y, z = q
        ang = 2 * math.acos(max(-1.0, min(1.0, w)))
        s = math.sqrt(max(1e-12, 1 - w * w))
        return x / s, y / s, z / s, ang

    def solid(name, x, y, children, bounding=None, def_name=None, z=None, yaw=0.0):
        z = ground_z(x, y) if z is None else z
        d = f"DEF {def_name} " if def_name else ""
        b = f"\n  boundingObject {bounding}" if bounding else ""
        r = f"\n  rotation 0 0 1 {f(yaw)}" if yaw else ""
        return f"{d}Solid {{\n  translation {f(x)} {f(y)} {f(z)}{r}\n  children [\n{children}\n  ]\n  name \"{name}\"{b}\n}}\n"

    def shape(geom, color, tz=0.0, rough=0.9):
        return (f"    Pose {{ translation 0 0 {f(tz)} children [ Shape {{ appearance PBRAppearance {{ "
                f"baseColor {color} roughness {rough} metalness 0 }} geometry {geom} }} ] }}")

    # -------------------------------------------------------------- build
    if a_expected and b_expected:
        print(f"trace check: A {ZONE_A.area:.0f} m2 ({ZONE_A.area / a_expected - 1:+.1%}), "
              f"B {ZONE_B.area:.0f} m2 ({ZONE_B.area / b_expected - 1:+.1%})")
    print(f"zones 1/2/3/4 = {ZONES['zone1'][1].area:.0f} / {ZONES['zone2'][1].area:.0f} / "
          f"{ZONES['zone3'][1].area:.0f} / {ZONE_B.area:.0f} m2; fence {FENCE.exterior.length:.0f} m around {FENCE.area:.0f} m2")
    print(f"slope: {GRADE:.1%} along the fall line (bearing {math.degrees(math.atan2(DOWN[0], DOWN[1])) % 360:.0f} deg), "
          f"garden from {min(plane_z(*p) for p in GARDEN.exterior.coords) + Z_OFFSET:.1f} "
          f"to {max(plane_z(*p) for p in GARDEN.exterior.coords) + Z_OFFSET:.1f} m")
    print("fascines: " + ", ".join(f"{c['name']} {c['length']} m" for c in CONTOURS))

    tx0, ty0, tx1, ty1 = TERRAIN["bbox"]
    spacing = 0.5
    nx = int((tx1 - tx0) / spacing) + 1
    ny = int((ty1 - ty0) / spacing) + 1
    x_max, y_max = tx0 + (nx - 1) * spacing, ty0 + (ny - 1) * spacing
    rows = []
    for j in range(ny):
        y = ty0 + j * spacing
        rows.append(" ".join(f"{ground_z(tx0 + i * spacing, y):.3f}" for i in range(nx)))

    os.makedirs(os.path.join(ROOT, "worlds", "textures"), exist_ok=True)
    tex_path = os.path.join(ROOT, "worlds", "textures", "ground.jpg")
    gimg = site.get("ground_image")
    if gimg:
        # ground texture = the site plan, cropped to exactly the terrain extent
        S = gimg["m_per_px"]
        PX0, PY0 = gimg["origin_px"]               # plan pixel of the local origin
        img = Image.open(os.path.join(site_dir, gimg["file"]))
        crop = (PX0 + tx0 / S, PY0 - y_max / S, PX0 + x_max / S, PY0 - ty0 / S)
        tex = img.crop(tuple(int(round(v)) for v in crop)).resize((1024, 1024), Image.LANCZOS)   # power of two for Webots
    else:
        # ground texture drawn from the zones (no plan image needed)
        size = 1024
        tex = Image.new("RGB", (size, size), (196, 205, 168))
        dr = ImageDraw.Draw(tex)

        def px(pt):
            return ((pt[0] - tx0) / (x_max - tx0) * size, (y_max - pt[1]) / (y_max - ty0) * size)

        colours = {"zone1": (150, 120, 80), "zone2": (140, 175, 100), "zone3": (95, 135, 80), "zone4": (165, 190, 120)}
        for zid, (_, zg) in ZONES.items():
            for part in getattr(zg, "geoms", [zg]):
                dr.polygon([px(p) for p in part.exterior.coords], fill=colours[zid], outline=(60, 60, 50))
        for v in VEG:                         # the vegetation map over the zones
            col = veg_props(v)["colour"]
            if "polygon" in v:
                dr.polygon([px(p) for p in v["polygon"]], fill=col)
            else:
                (cx_, cy_), r_ = v["circle"], v.get("canopy_r", v.get("r", 1.0))
                (ax_, ay_), (bx_, by_) = px((cx_ - r_, cy_ + r_)), px((cx_ + r_, cy_ - r_))
                dr.ellipse([ax_, ay_, bx_, by_], fill=col)
        dr.line([px(p) for p in FENCE.exterior.coords], fill=(90, 90, 80), width=3)
    tex.save(tex_path, quality=90)

    cx, cy = GARDEN.centroid.x, GARDEN.centroid.y
    yaw = math.atan2(UP[1], UP[0])          # look uphill, towards the house
    pitch = math.radians(32)
    q = quat_mul((math.cos(yaw / 2), 0, 0, math.sin(yaw / 2)), (math.cos(pitch / 2), 0, math.sin(pitch / 2), 0))
    ax, ay, az, ang = axis_angle(q)
    look = (math.cos(pitch) * math.cos(yaw), math.cos(pitch) * math.sin(yaw), -math.sin(pitch))
    dist = 100.0
    cz = plane_z(cx, cy)
    cam = (cx - look[0] * dist, cy - look[1] * dist, cz - look[2] * dist)

    def q_str(s):
        return '"' + s.replace('"', "'") + '"'

    w = ["#VRML_SIM R2025a utf8\n", "# generated by tools/generate_world.py; self-contained: no assets downloaded",
         'EXTERNPROTO "../protos/ExplorerRover.proto"', 'EXTERNPROTO "../protos/IrPost.proto"\n']
    info = "\n".join("    " + q_str(s) for s in site.get("info", []))
    w.append(f"""WorldInfo {{
  info [
{info}
  ]
  title {q_str(site["name"])}
  basicTimeStep 32
  contactProperties [
    ContactProperties {{ coulombFriction [ 0.8 ] }}
  ]
}}""")
    w.append(f"Viewpoint {{\n  orientation {f(ax)} {f(ay)} {f(az)} {f(ang)}\n  position {f(cam[0])} {f(cam[1])} {f(cam[2])}\n}}")
    w.append("""Background {
  skyColor [ 0.62 0.78 0.92 ]
  luminosity 1.2
}
DirectionalLight {
  ambientIntensity 0.7
  direction -0.4 -0.6 -1
  intensity 2.0
  castShadows TRUE
}
DirectionalLight {
  ambientIntensity 0.3
  direction 0.5 0.4 -0.6
  intensity 0.6
}""")
    hstr = "\n".join(rows)
    w.append(f"""DEF TERRAIN Solid {{
  translation {f(tx0)} {f(ty0)} 0
  children [
    Shape {{
      appearance PBRAppearance {{
        baseColorMap ImageTexture {{ url [ "textures/ground.jpg" ] }}
        roughness 1
        metalness 0
      }}
      geometry DEF TERRAIN_GRID ElevationGrid {{
        xDimension {nx}
        xSpacing {spacing}
        yDimension {ny}
        ySpacing {spacing}
        thickness 2
        height [
{hstr}
        ]
      }}
    }}
  ]
  name "terrain"
  boundingObject USE TERRAIN_GRID
  locked TRUE
}}""")

    px_, py_ = POND_C
    w.append(solid("pond_water", px_, py_, shape(f"Cylinder {{ height 0.02 radius {f(POND['radius'] - 0.3)} }}",
                                                 "0.2 0.35 0.45", rough=0.1), z=plane_z(px_, py_) - 0.35))

    # fence: 1.8 m knotted wire, 1.5 m panels following the ground
    ring = list(FENCE.exterior.coords)
    k = 0
    for (x0, y0), (x1, y1) in zip(ring[:-1], ring[1:]):
        seg = math.hypot(x1 - x0, y1 - y0)
        n = max(1, int(math.ceil(seg / 1.5)))
        yawf = math.atan2(y1 - y0, x1 - x0)
        for i in range(n):
            ax_ = x0 + (x1 - x0) * (i + 0.5) / n
            ay_ = y0 + (y1 - y0) * (i + 0.5) / n
            ln = seg / n
            zt = max(ground_z(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n),
                     ground_z(x0 + (x1 - x0) * (i + 1) / n, y0 + (y1 - y0) * (i + 1) / n))
            zb = min(ground_z(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n),
                     ground_z(x0 + (x1 - x0) * (i + 1) / n, y0 + (y1 - y0) * (i + 1) / n))
            hgt = 1.8 + (zt - zb) + 0.2
            geom = f"Box {{ size {f(ln + 0.02)} 0.04 {f(hgt)} }}"
            k += 1
            w.append(solid(f"fence_{k}", ax_, ay_, shape(geom, "0.55 0.55 0.5", hgt / 2, 0.9),
                           bounding=f"Pose {{ translation 0 0 {f(hgt / 2)} children [ {geom} ] }}",
                           z=zb - 0.2, yaw=yawf))

    # house (at the high point), pool, tank, nest
    hx, hy = HX, HY
    geom = "Box { size 12 9 7 }"
    w.append(solid("house", hx, hy, shape(geom, "0.75 0.55 0.45", 2.5),
                   bounding="Pose { translation 0 0 2.5 children [ Box { size 12 9 7 } ] }", z=plane_z(hx, hy) - 1.0))
    obstacles_extra = [[round(HX, 2), round(HY, 2), 8.0]]
    pool = site.get("pool")
    if pool:
        qx, qy = pool["pos"]
        geom = f"Box {{ size {f(pool['size'][0])} {f(pool['size'][1])} 1.2 }}"
        w.append(solid("pool", qx, qy, shape(geom, "0.3 0.65 0.85", 0.0, 0.1), yaw=math.radians(pool["yaw_deg"]),
                       bounding=f"Pose {{ translation 0 0 0 children [ {geom} ] }}", z=plane_z(qx, qy) + 0.3))
        obstacles_extra.insert(0, [round(qx, 2), round(qy, 2), 4.5])
    tx_, ty_ = TANK["center"]
    geom = f"Cylinder {{ height {f(TANK['height'])} radius {f(TANK['radius'])} }}"
    w.append(solid("tank_10m3", tx_, ty_, shape(geom, "0.25 0.3 0.25", TANK["height"] / 2),
                   bounding=f"Pose {{ translation 0 0 {f(TANK['height'] / 2)} children [ {geom} ] }}"))
    nx_, ny_ = NEST["center"]
    sx, sy, sz = NEST["size"]
    sz2 = sz + 1.2                       # dug into the slope: the downhill wall reaches the ground too
    geom = f"Box {{ size {f(sx)} {f(sy)} {f(sz2)} }}"
    w.append(solid("nest_1", nx_, ny_, shape(geom, "0.5 0.35 0.2", sz - sz2 / 2), yaw=NEST["yaw"],
                   bounding=f"Pose {{ translation 0 0 {f(sz - sz2 / 2)} children [ {geom} ] }}"))

    # fascines: woven chestnut on stakes, 30 cm, with passages
    for c in CONTOURS:
        (ax_, ay_), (bx_, by_) = c["a"], c["b"]
        line = LineString([c["a"], c["b"]])
        cuts = sorted(line.project(Point(*p)) for p in c["crossings"])
        pieces, s0 = [], 0.0
        for cp in cuts:
            pieces.append((s0, cp - CROSS_HALF))
            s0 = cp + CROSS_HALF
        pieces.append((s0, line.length))
        yawf = math.atan2(by_ - ay_, bx_ - ax_)
        for i, (s_a, s_b) in enumerate(pieces):
            if s_b - s_a < 0.3:
                continue
            p = line.interpolate((s_a + s_b) / 2)
            hb = c["height"] + 0.4             # 0.3 m above ground, rest buried (staked into the slope)
            geom = f"Box {{ size {f(s_b - s_a)} 0.2 {f(hb)} }}"
            zt = plane_z(p.x, p.y) + c["height"]
            w.append(solid(f"{c['name']}_{i + 1}", p.x, p.y, shape(geom, "0.45 0.32 0.18", -hb / 2),
                           bounding=f"Pose {{ translation 0 0 {f(-hb / 2)} children [ {geom} ] }}",
                           yaw=yawf, z=zt))

    def rgb(c):
        return " ".join(f"{v / 255:.2f}" for v in c)

    for kk, (x, y, r, h, col) in enumerate(SHRUBS):
        geom = f"Cylinder {{ height {f(h)} radius {f(r)} }}"
        w.append(solid(f"shrub_{kk + 1}", x, y, shape(geom, rgb(col), h / 2),
                       bounding=f"Pose {{ translation 0 0 {f(h / 2)} children [ {geom} ] }}"))
    for kk, (x, y, h, col) in enumerate(PATCH_BOXES):
        geom = f"Box {{ size 1 1 {f(h)} }}"
        w.append(solid(f"veg_patch_{kk + 1}", x, y, shape(geom, rgb(col), h / 2),
                       bounding=f"Pose {{ translation 0 0 {f(h / 2)} children [ {geom} ] }}"))
    for kk, (x, y) in enumerate(OAKS):
        trunk = "Cylinder { height 4 radius 0.4 }"
        ch = (shape(trunk, "0.35 0.25 0.15", 2.0) + "\n" +
              shape(f"Sphere {{ radius {f(OAK_CANOPY)} subdivision 2 }}", "0.2 0.35 0.15", 6.5))
        w.append(solid(f"oak_{kk + 1}", x, y, ch, bounding=f"Pose {{ translation 0 0 2 children [ {trunk} ] }}"))
    for t in TREES:
        x, y = t["pos"]
        trunk = f"Cylinder {{ height {f(t['height'])} radius {f(t['trunk'])} }}"
        ch = (shape(trunk, "0.4 0.3 0.2", t["height"] / 2) + "\n" +
              shape(f"Sphere {{ radius {f(t['canopy'])} subdivision 2 }}", "0.3 0.5 0.2", t["height"]))
        w.append(solid(t["name"], x, y, ch, bounding=f"Pose {{ translation 0 0 {f(t['height'] / 2)} children [ {trunk} ] }}"))

    HIDDEN = site.get("unknown", [])
    for kk, u in enumerate(HIDDEN):           # not in site_config.json: the rovers do not know about these
        x, y = u["pos"]
        r, h = u.get("r", 0.3), u.get("h", 0.4)
        geom = f"Box {{ size {f(2 * r)} {f(2 * r)} {f(h)} }}"
        colour = {"rock": "0.45 0.42 0.4", "branch": "0.35 0.25 0.15"}.get(u.get("kind"), "0.4 0.4 0.4")
        w.append(solid(f"hidden_{kk + 1}_{u.get('kind', 'object')}", x, y, shape(geom, colour, h / 2),
                       bounding=f"Pose {{ translation 0 0 {f(h / 2)} children [ {geom} ] }}"))
    for aid, x, y in ANCHORS:
        post = f"Cylinder {{ height {f(ANCHOR_HEIGHT)} radius 0.05 }}"
        ch = shape(post, "0.4 0.4 0.4", ANCHOR_HEIGHT / 2) + "\n" + shape("Box { size 0.1 0.1 0.08 }", "1 0.5 0", ANCHOR_HEIGHT)
        w.append(solid(f"uwb_anchor_{aid}", x, y, ch, def_name=f"UWB_A{aid}",
                       bounding=f"Pose {{ translation 0 0 {f(ANCHOR_HEIGHT / 2)} children [ {post} ] }}"))
    for pid, label, zone, x, y in POSTS:
        w.append(f"DEF POST_{pid} IrPost {{\n  translation {f(x)} {f(y)} {f(ground_z(x, y))}\n"
                 f"  name \"post_{pid}\"\n  controllerArgs [ \"{pid}\" ]\n}}")
    for kk, (name, (x, y, yw)) in enumerate(DOCKS.items()):
        ctrl = '\n  controller "<extern>"' if ros else ""
        w.append(f"DEF ROVER{kk + 1} ExplorerRover {{\n  translation {f(x)} {f(y)} {f(ground_z(x, y) + 0.12)}\n"
                 f"  rotation 0 0 1 {f(yw)}\n  name \"{name}\"{ctrl}\n}}")
    w.append(f"""DEF GARDEN Robot {{
  name "garden_supervisor"
  controller "{'<extern>' if ros else 'garden_supervisor'}"
  supervisor TRUE
  children [
    Emitter {{ name "radio_tx" channel 5 range -1 }}
    Receiver {{ name "radio_rx" channel 6 }}
  ]
}}""")
    world_name = "site_ros.wbt" if ros else "site.wbt"
    with open(os.path.join(ROOT, "worlds", world_name), "w") as fh:
        fh.write("\n".join(w) + "\n")

    def coords(gm):
        return [[round(x, 2), round(y, 2)] for x, y in gm.exterior.coords]

    obstacles = [[round(x, 2), round(y, 2), r] for x, y, r in STATIC_OBS]
    obstacles += obstacles_extra
    for c in CONTOURS:                      # fascines as a row of small obstacles, except at the passages
        line = LineString([c["a"], c["b"]])
        n = int(line.length / 0.5) + 1
        for i in range(n + 1):
            p = line.interpolate(i / n, normalized=True)
            if min(math.hypot(p.x - q[0], p.y - q[1]) for q in c["crossings"]) > CROSS_HALF + 0.4:
                obstacles.append([round(p.x, 2), round(p.y, 2), 0.15])
    cfg = {
        "note": f"Generated by tools/generate_world.py from the site file of {site['name']}. "
                "Elevations from 2 points, not surveyed.",
        "frame": f"local ENU metres; z = elevation - {Z_OFFSET:g} m",
        "time_scale": TIME_SCALE,
        "terrain": {"type": "plane", "ref": [round(HX, 3), round(HY, 3)], "z_ref": Z_HIGH,
                    "grad": [round(GX, 5), round(GY, 5)], "grade": round(GRADE, 4), "z_offset": Z_OFFSET},
        "bbox": [round(tx0, 2), round(ty0, 2), round(x_max, 2), round(y_max, 2)],
        "zones": {zid: {"label": zl, "area_m2": round(zg.area, 1), "polygon": coords(zg)}
                  for zid, (zl, zg) in ZONES.items()},
        "garden_polygon": coords(GARDEN),
        "fence_polygon": coords(FENCE),
        "uphill": [round(UP[0], 4), round(UP[1], 4)],
        "contours": CONTOURS,
        "pond": POND,
        "oaks": [{"pos": [round(x, 2), round(y, 2)], "canopy_r": OAK_CANOPY} for x, y in OAKS],
        "canopies": CANOPIES,
        "vegetation": VEG,
        "nest": NEST,
        "tank": TANK,
        "docks": DOCKS,
        "anchors": [{"id": a, "def": f"UWB_A{a}", "pos": [x, y, round(ground_z(x, y) + ANCHOR_HEIGHT, 3)]}
                    for a, x, y in ANCHORS],
        "posts": [{"id": p, "def": f"POST_{p}", "label": pl, "zone": z, "pos": [round(x, 2), round(y, 2)],
                   "stand": stand_point(x, y)} for p, pl, z, x, y in POSTS],
        "rovers": {name: f"ROVER{kk + 1}" for kk, name in enumerate(DOCKS)},
        "events": EVENTS,
        "half_lives_h": HALF_LIVES_H,
        "obstacles": obstacles,
        "frame": {"geofence": [list(p) for p in fr.get("geofence", coords(GARDEN))],
                  "no_go": fr.get("no_go", [])},
        "mission": {"explore_first": site.get("explore_first", True), "cell_m": site.get("cell_m", 4.0)},
    }
    with open(os.path.join(ROOT, "site_config.json"), "w") as fh:
        json.dump(cfg, fh, indent=2)
    with open(os.path.join(ROOT, "worlds", "truth.json"), "w") as fh:     # for the report only, never for rovers
        json.dump({"hidden": HIDDEN}, fh, indent=2)
    check_reachable(cfg)
    print(f"vegetation: {len(VEG)} units, {len(CANOPIES)} canopies, {len(SHRUBS)} shrubs, "
          f"{len(PATCH_BOXES)} m2 of hedge and bramble")
    print(f"world: {nx}x{ny} terrain, {len(TREES)} trees, {len(OAKS)} oaks, {len(ANCHORS)} anchors, "
          f"{len(POSTS)} IR posts, {len(DOCKS)} rovers, {k} fence panels")


def check_reachable(cfg):
    """Every post's stand point and every dock approach must be reachable from each dock inside the frame."""
    grid = NavGrid(cfg)
    problems = []
    for rover, dock in cfg["docks"].items():
        reach = grid.reachable(dock[:2])
        back = 3.0
        approach = (dock[0] - back * math.cos(dock[2]), dock[1] - back * math.sin(dock[2]))
        targets = [(f"post {p['id']} stand point", p["stand"]) for p in cfg["posts"]] + [("dock approach", approach)]
        for label, xy in targets:
            c = grid.nearest_free(*xy, max_r=1.0)
            if c is None or c not in reach:
                problems.append(f"{rover}: {label} at ({xy[0]:.1f}, {xy[1]:.1f}) is not reachable inside the frame")
    free = sum(grid.free)
    print(f"frame: {free * grid.res ** 2:.0f} m2 drivable, {len(cfg['frame']['no_go'])} no-go areas")
    if problems:
        raise SystemExit("\n".join(problems))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--site", default=DEFAULT_SITE,
                    help="a site under sites/ by name (default: permademo), or a path to a private site file")
    ap.add_argument("--ros", action="store_true",
                    help="rovers and garden as <extern> controllers for ROS 2 (writes worlds/site_ros.wbt)")
    a = ap.parse_args()
    generate(site_path(a.site), ros=a.ros)
