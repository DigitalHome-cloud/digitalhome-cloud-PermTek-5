#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Fetch a real site's relief and aerial photo from IGN into its PRIVATE pack (ADR 0030).

    python3 tools/fetch_ign.py --site ../private/site.json            # the relief and the aerial photo
    python3 tools/fetch_ign.py --site ../private/site.json --no-ortho # the relief only

France only. Asks IGN's Géoplateforme (data.geopf.fr, WMS-R) for the site's terrain.bbox, with a margin:
  - the bare-earth relief: LiDAR HD's MNT (0.5 m) where it exists, else RGE ALTI (1 m); raw 32-bit floats
  - the aerial photo: BD ORTHO (20 cm) for the ground texture and the garden film
and writes dem.tif and ortho.jpg next to the site file, then sets its terrain.dem and ground_image.

The site file must already say where its local 0, 0 is: terrain.dem.origin, the Lambert-93 (EPSG:2154) easting and
northing of that point. That number locates the site: it lives only in the private pack. This tool refuses to
write inside this public repository. Source: IGN, Licence Ouverte 2.0 (credited in the site file's info).
"""
import argparse
import json
import os
import sys
import urllib.parse
import urllib.request

import numpy as np

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))       # the whole public repository
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dem import write_geotiff  # noqa: E402

WMS = "https://data.geopf.fr/wms-r/wms"
LAYERS = {"lidar": ("IGNF_LIDAR-HD_MNT_ELEVATION.ELEVATIONGRIDCOVERAGE.LAMB93", 0.5, "IGN LiDAR HD, MNT"),
          "rgealti": ("ELEVATION.ELEVATIONGRIDCOVERAGE.HIGHRES", 1.0, "IGN RGE ALTI")}
ORTHO = ("ORTHOIMAGERY.ORTHOPHOTOS", 0.2, "IGN BD ORTHO")
LICENCE = "Licence Ouverte 2.0"
PROJECTION = "EPSG:2154"  # Lambert-93: metres east and north, the projection of IGN's French data
MAX_PX = 4000           # the service's largest picture side; bigger extents are asked for in tiles
NODATA_BELOW = -1000.0  # what the service sends where it has no data


def get(params, timeout=120):
    query = [("SERVICE", "WMS"), ("VERSION", "1.3.0"), ("REQUEST", "GetMap"), ("STYLES", ""), ("CRS", PROJECTION), *params.items()]
    url = WMS + "?" + urllib.parse.urlencode(query)
    req = urllib.request.Request(url, headers={"User-Agent": "permaculture-twin fetch_ign.py"})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        kind = r.headers.get("Content-Type", "")
        body = r.read()
    if "xml" in kind or "html" in kind:
        raise SystemExit("IGN answered with an error: " + body[:300].decode(errors="replace"))
    return body


def tiles(e0, n0, e1, n1, cell):
    """The extent in pieces of at most MAX_PX pixels a side: (e0, n0, e1, n1, width, height, col, row)."""
    step = MAX_PX * cell
    rows = int(np.ceil((n1 - n0) / step))
    cols = int(np.ceil((e1 - e0) / step))
    for r in range(rows):
        for c in range(cols):
            te0, tn1 = e0 + c * step, n1 - r * step
            te1, tn0 = min(e1, te0 + step), max(n0, tn1 - step)
            yield te0, tn0, te1, tn1, int(round((te1 - te0) / cell)), int(round((tn1 - tn0) / cell)), c, r


def relief(e0, n0, e1, n1, source):
    layer, cell, name = LAYERS[source]
    w, h = int(round((e1 - e0) / cell)), int(round((n1 - n0) / cell))
    out = np.empty((h, w), dtype="f4")
    step = int(MAX_PX)
    for te0, tn0, te1, tn1, tw, th, c, r in tiles(e0, n0, e1, n1, cell):
        body = get({"LAYERS": layer, "BBOX": f"{te0},{tn0},{te1},{tn1}", "WIDTH": tw, "HEIGHT": th, "FORMAT": "image/x-bil;bits=32"})
        part = np.frombuffer(body, dtype="<f4")              # little-endian floats, rows from the north
        if part.size != tw * th:
            raise SystemExit(f"{name}: expected {tw * th} heights, got {part.size}")
        out[r * step:r * step + th, c * step:c * step + tw] = part.reshape(th, tw)
    return out, cell, name


def main():
    ap = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    ap.add_argument("--site", required=True, help="the PRIVATE site file (its folder receives dem.tif and ortho.jpg)")
    ap.add_argument("--source", choices=("auto", "lidar", "rgealti"), default="auto",
                    help="auto: LiDAR HD where it covers the site, else RGE ALTI")
    ap.add_argument("--margin", type=float, default=5.0, help="metres around the site's terrain.bbox")
    ap.add_argument("--no-ortho", action="store_true", help="fetch the relief only")
    a = ap.parse_args()

    site_path = os.path.abspath(a.site)
    site_dir = os.path.dirname(site_path)
    if os.path.commonpath([site_dir, ROOT]) == ROOT:
        raise SystemExit("refused: the site's folder is inside the public repository. Real data belongs in the private pack.")
    with open(site_path) as fh:
        site = json.load(fh)
    t = site["terrain"]
    origin = (t.get("dem") or {}).get("origin")
    if not origin:
        raise SystemExit('the site file needs terrain.dem.origin: the Lambert-93 easting and northing of its local 0, 0 '
                         '(e.g. "dem": {"origin": [E, N]})')
    x0, y0, x1, y1 = t["bbox"]
    x0, y0, x1, y1 = x0 - a.margin, y0 - a.margin, x1 + a.margin, y1 + a.margin
    e0, n0, e1, n1 = origin[0] + x0, origin[1] + y0, origin[0] + x1, origin[1] + y1

    sources = ("lidar", "rgealti") if a.source == "auto" else (a.source,)
    for source in sources:
        heights, cell, name = relief(e0, n0, e1, n1, source)
        missing = float((heights < NODATA_BELOW).mean())
        if missing < 0.05:
            break
        print(f"  {name}: {missing:.0%} of the site has no data" + (", trying the next source" if source != sources[-1] else ""))
    heights = np.where(heights < NODATA_BELOW, -99999.0, heights)
    write_geotiff(os.path.join(site_dir, "dem.tif"), heights, e0, n1, cell)
    t["dem"] = {**t.get("dem", {}), "file": "dem.tif", "projection": PROJECTION, "origin": origin, "source": name, "cell_m": cell}
    print(f"  dem.tif: {heights.shape[1]} x {heights.shape[0]} cells of {cell:g} m from {name}")
    credits = [f"Relief: {name}, {LICENCE}"]

    if not a.no_ortho:
        layer, ocell, oname = ORTHO
        w, h = int(round((e1 - e0) / ocell)), int(round((n1 - n0) / ocell))
        if max(w, h) > MAX_PX:
            ocell = max(e1 - e0, n1 - n0) / MAX_PX
            w, h = int(round((e1 - e0) / ocell)), int(round((n1 - n0) / ocell))
        body = get({"LAYERS": layer, "BBOX": f"{e0},{n0},{e1},{n1}", "WIDTH": w, "HEIGHT": h, "FORMAT": "image/jpeg"})
        with open(os.path.join(site_dir, "ortho.jpg"), "wb") as fh:
            fh.write(body)
        # the ground texture: the photo's pixel of the local origin, and its scale (generate_world.py crops it)
        site["ground_image"] = {"file": "ortho.jpg", "m_per_px": ocell, "origin_px": [round(-x0 / ocell, 2), round(y1 / ocell, 2)]}
        credits.append(f"Aerial photo: {oname}, {LICENCE}")
        print(f"  ortho.jpg: {w} x {h} px of {ocell:.2f} m from {oname}")

    info = [s for s in site.get("info", []) if not s.startswith(("Relief: IGN", "Aerial photo: IGN"))]
    site["info"] = info + credits
    with open(site_path, "w") as fh:
        json.dump(site, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    print(f"  {os.path.basename(site_path)}: terrain.dem{' and ground_image' if not a.no_ortho else ''} set. "
          f"Now: python3 tools/generate_world.py --site {a.site}")


if __name__ == "__main__":
    main()
