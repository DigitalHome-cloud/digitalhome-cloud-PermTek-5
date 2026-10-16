# SPDX-License-Identifier: GPL-3.0-or-later
"""A site's elevation model (DEM), for the world's ground (ADR 0030).

The site file names it in terrain.dem: {"file": "dem.tif", "projection": "EPSG:2154", "origin": [E, N]}, where origin is
the projected coordinate of the site's local 0, 0 (local x = east, y = north, in metres). The heights are metres
above sea level; the world subtracts z_offset as it always has.

    dem = Dem.load(site_dir, terrain["dem"])
    dem.z(x, y)          the height at a local point, sampled bilinearly
    dem.fall_line()      the least-squares plane: grade, the uphill unit vector, and the height at the origin

    write_geotiff(path, heights, e0, n0, cell)   a single-band float32 GeoTIFF, north-up (what fetch_ign.py writes)
    read_geotiff(path)                           -> heights, e0, n0, cell, nodata

The GeoTIFFs this project writes are plain (uncompressed float32 strips) and read with numpy alone; another
(compressed) GeoTIFF is read with tifffile when it is installed. Real elevation data is private: it stays in the
site's private pack, never in this repository (scripts/check-public.sh).
"""
import math
import os
import struct

import numpy as np

# GeoTIFF tags: pixel size, tie point (raster corner -> model coordinate), GDAL's nodata as text
TAG_PIXEL_SCALE, TAG_TIEPOINT, TAG_GEOKEYS, TAG_NODATA = 33550, 33922, 34735, 42113
NODATA = -99999.0


def write_geotiff(path, heights, e0, n0, cell, nodata=NODATA, epsg=2154):
    """heights[row][col], row 0 the northern edge; (e0, n0) the top-left corner of the top-left cell."""
    h = np.asarray(heights, dtype="<f4")
    rows, cols = h.shape
    data = h.tobytes()
    entries = []                                              # (tag, type, count, value bytes)

    def short(tag, *v):
        entries.append((tag, 3, len(v), struct.pack(f"<{len(v)}H", *v)))

    def long(tag, *v):
        entries.append((tag, 4, len(v), struct.pack(f"<{len(v)}I", *v)))

    def double(tag, *v):
        entries.append((tag, 12, len(v), struct.pack(f"<{len(v)}d", *v)))

    def ascii_(tag, s):
        b = s.encode() + b"\0"
        entries.append((tag, 2, len(b), b))

    short(256, cols); short(257, rows); short(258, 32); short(259, 1); short(262, 1)
    long(273, 0)                                              # strip offset, set below
    short(277, 1); long(278, rows); long(279, len(data)); short(284, 1); short(339, 3)
    double(TAG_PIXEL_SCALE, cell, cell, 0.0)
    double(TAG_TIEPOINT, 0.0, 0.0, 0.0, e0, n0, 0.0)
    # GeoKeys: projected, pixel is area, the EPSG code of the projected CRS
    short(TAG_GEOKEYS, 1, 1, 0, 3, 1024, 0, 1, 1, 1025, 0, 1, 1, 3072, 0, 1, epsg)
    ascii_(TAG_NODATA, repr(float(nodata)))
    entries.sort()
    ifd_at = 8
    ifd_size = 2 + 12 * len(entries) + 4
    extra_at = ifd_at + ifd_size
    extra = b""
    offsets = {}
    for tag, typ, count, val in entries:                      # values over 4 bytes live after the directory
        if len(val) > 4:
            offsets[tag] = extra_at + len(extra)
            extra += val + (b"\0" if len(val) % 2 else b"")
    data_at = extra_at + len(extra)
    out = bytearray(b"II*\0" + struct.pack("<I", ifd_at) + struct.pack("<H", len(entries)))
    for tag, typ, count, val in entries:
        if tag == 273:
            val = struct.pack("<I", data_at)
        field = struct.pack("<I", offsets[tag]) if tag in offsets else val.ljust(4, b"\0")
        out += struct.pack("<HHI", tag, typ, count) + field
    out += struct.pack("<I", 0) + extra + data
    with open(path, "wb") as fh:
        fh.write(out)


def read_geotiff(path):
    """heights (rows x cols, row 0 north), e0, n0 (top-left corner), cell (m), nodata (or None)."""
    with open(path, "rb") as fh:
        b = fh.read()
    if b[:4] != b"II*\0":
        return _read_with_tifffile(path)
    ifd = struct.unpack_from("<I", b, 4)[0]
    n = struct.unpack_from("<H", b, ifd)[0]
    size = {1: 1, 2: 1, 3: 2, 4: 4, 11: 4, 12: 8}
    fmt = {1: "B", 2: "s", 3: "H", 4: "I", 11: "f", 12: "d"}
    tags = {}
    for i in range(n):
        tag, typ, count = struct.unpack_from("<HHI", b, ifd + 2 + 12 * i)
        at = ifd + 2 + 12 * i + 8
        if size.get(typ, 1) * count > 4:
            at = struct.unpack_from("<I", b, at)[0]
        if typ == 2:
            tags[tag] = b[at:at + count].rstrip(b"\0").decode()
        else:
            tags[tag] = struct.unpack_from(f"<{count}{fmt[typ]}", b, at)
    if tags.get(259, (1,))[0] != 1 or tags.get(258, (0,))[0] != 32 or tags.get(339, (3,))[0] != 3:
        return _read_with_tifffile(path)                      # compressed, or not float32: let tifffile read it
    cols, rows = tags[256][0], tags[257][0]
    per_strip = tags.get(278, (rows,))[0]
    heights = np.empty((rows, cols), dtype="<f4")
    for k, (off, cnt) in enumerate(zip(tags[273], tags[279])):
        r0 = k * per_strip
        part = np.frombuffer(b, dtype="<f4", count=cnt // 4, offset=off).reshape(-1, cols)
        heights[r0:r0 + part.shape[0]] = part
    sx = tags[TAG_PIXEL_SCALE][0]
    _, _, _, e0, n0, _ = tags[TAG_TIEPOINT][:6]
    nodata = float(tags[TAG_NODATA]) if TAG_NODATA in tags else None
    return heights.astype(float), e0, n0, sx, nodata


def _read_with_tifffile(path):
    try:
        import tifffile
    except ImportError:
        raise ValueError(f"{path}: a compressed or non-float GeoTIFF needs tifffile (pip install tifffile)") from None
    with tifffile.TiffFile(path) as t:
        page = t.pages[0]
        heights = page.asarray().astype(float)
        scale = page.tags[TAG_PIXEL_SCALE].value
        tie = page.tags[TAG_TIEPOINT].value
        nodata = float(page.tags[TAG_NODATA].value) if TAG_NODATA in page.tags else None
    return heights, tie[3], tie[4], scale[0], nodata


def _fill(h, nodata):
    """Nodata cells take the mean of their valid neighbours, ring by ring, until none is left."""
    bad = ~np.isfinite(h) if nodata is None else (~np.isfinite(h)) | (np.abs(h - nodata) < 1e-3)
    if bad.all():
        raise ValueError("the elevation model has no valid height")
    h = np.where(bad, np.nan, h)
    while np.isnan(h).any():
        p = np.pad(h, 1, constant_values=np.nan)
        near = np.stack([p[:-2, 1:-1], p[2:, 1:-1], p[1:-1, :-2], p[1:-1, 2:]])
        valid = ~np.isnan(near)
        count = valid.sum(axis=0)
        mean = np.where(count > 0, np.where(valid, near, 0.0).sum(axis=0) / np.maximum(count, 1), np.nan)
        h = np.where(np.isnan(h), mean, h)
    return h


class Dem:
    def __init__(self, heights, e0, n0, cell, origin, nodata=None):
        self.h = _fill(np.asarray(heights, dtype=float), nodata)
        self.e0, self.n0, self.cell = float(e0), float(n0), float(cell)
        self.oe, self.on = float(origin[0]), float(origin[1])

    @classmethod
    def load(cls, site_dir, spec):
        heights, e0, n0, cell, nodata = read_geotiff(os.path.join(site_dir, spec["file"]))
        return cls(heights, e0, n0, cell, spec["origin"], nodata)

    def z(self, x, y):
        """Height at local (x east, y north) metres, bilinear between cell centres; clamped at the edges."""
        c = (self.oe + x - self.e0) / self.cell - 0.5
        r = (self.n0 - (self.on + y)) / self.cell - 0.5
        rows, cols = self.h.shape
        c = min(max(c, 0.0), cols - 1.0)
        r = min(max(r, 0.0), rows - 1.0)
        c0, r0 = min(int(c), cols - 2) if cols > 1 else 0, min(int(r), rows - 2) if rows > 1 else 0
        fc, fr = c - c0, r - r0
        c1, r1 = min(c0 + 1, cols - 1), min(r0 + 1, rows - 1)
        top = self.h[r0, c0] * (1 - fc) + self.h[r0, c1] * fc
        bottom = self.h[r1, c0] * (1 - fc) + self.h[r1, c1] * fc
        return float(top * (1 - fr) + bottom * fr)

    def fall_line(self, bbox=None):
        """The plane that fits the heights best (over bbox, local metres, or the whole model): its grade
        (rise per metre), the uphill unit vector (east, north) and its height at the local origin."""
        rows, cols = self.h.shape
        cs = np.arange(cols)
        rs = np.arange(rows)
        xs = self.e0 + (cs + 0.5) * self.cell - self.oe
        ys = self.n0 - (rs + 0.5) * self.cell - self.on
        X, Y = np.meshgrid(xs, ys)
        keep = np.ones_like(X, dtype=bool)
        if bbox:
            x0, y0, x1, y1 = bbox
            keep = (X >= x0) & (X <= x1) & (Y >= y0) & (Y <= y1)
        A = np.column_stack([X[keep], Y[keep], np.ones(keep.sum())])
        gx, gy, z0 = np.linalg.lstsq(A, self.h[keep], rcond=None)[0]
        grade = math.hypot(gx, gy)
        up = (gx / grade, gy / grade) if grade > 1e-9 else (0.0, 1.0)
        return grade, up, float(z0)
