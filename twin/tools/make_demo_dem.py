#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Write the invented relief of PermaDemo-relief, so a public site exercises the elevation-model path (ADR 0030)
without real data. PermaDemo itself stays on its plane (the reference).

    python3 tools/make_demo_dem.py            # writes sites/permademo-relief/dem.tif (CC0, like the sites)

The relief is PermaDemo's slope plane (its two points in site.json) with gentle seeded undulations and one small
hollow downhill, on 1 m cells. Its origin is a made-up projected coordinate that locates nothing.
"""
import json
import math
import os
import random
import sys

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "tools"))
from dem import write_geotiff  # noqa: E402

SITE = os.path.join(ROOT, "sites", "permademo")             # its plane and bbox
OUT = os.path.join(ROOT, "sites", "permademo-relief", "dem.tif")
ORIGIN = (100000.0, 100000.0)     # invented: no place on earth is meant
CELL = 1.0
MARGIN = 5.0


def relief(site, x, y):
    t = site["terrain"]
    (hx, hy), (bx, by) = t["high"]["pos"], t["low"]["pos"]
    zh, zl = t["high"]["z"], t["low"]["z"]
    L = math.hypot(hx - bx, hy - by)
    ux, uy = (hx - bx) / L, (hy - by) / L
    z = zh + (zh - zl) / L * ((x - hx) * ux + (y - hy) * uy)
    rng = random.Random(7)
    for _ in range(5):                                   # long, low swells: a field is never a plane
        kx, ky = rng.uniform(-1, 1) / 18.0, rng.uniform(-1, 1) / 18.0
        z += rng.uniform(0.10, 0.25) * math.sin(kx * x + ky * y + rng.uniform(0, 6.28))
    cx, cy = (bx * 0.7 + hx * 0.3), (by * 0.7 + hy * 0.3)
    d = math.hypot(x - cx, y - cy)
    z -= 0.6 * math.exp(-(d / 6.0) ** 2)                 # a small hollow where water gathers
    return z + site.get("z_offset", 0.0)


def main():
    with open(os.path.join(SITE, "site.json")) as fh:
        site = json.load(fh)
    x0, y0, x1, y1 = site["terrain"]["bbox"]
    x0, y0, x1, y1 = x0 - MARGIN, y0 - MARGIN, x1 + MARGIN, y1 + MARGIN
    cols, rows = int(round((x1 - x0) / CELL)), int(round((y1 - y0) / CELL))
    e0, n0 = ORIGIN[0] + x0, ORIGIN[1] + y1             # the top-left corner, in the made-up projection
    heights = np.array([[relief(site, x0 + (c + 0.5) * CELL, y1 - (r + 0.5) * CELL) for c in range(cols)] for r in range(rows)])
    write_geotiff(OUT, heights, e0, n0, CELL)
    print(f"  sites/permademo-relief/dem.tif: {cols} x {rows} cells of {CELL:g} m, {heights.min():.1f} to {heights.max():.1f} m")


if __name__ == "__main__":
    main()
