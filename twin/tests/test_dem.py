# SPDX-License-Identifier: GPL-3.0-or-later
"""The site's elevation model (tools/dem.py, ADR 0030): read and written as GeoTIFF, sampled, its fall line, and the
world's ground made from it."""
import json
import math
import os
import sys

import numpy as np
import pytest

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(ROOT, "tools"))
import dem  # noqa: E402


def plane(e0=1000.0, n0=2000.0, rows=40, cols=50, cell=1.0, gx=0.1, gy=0.2, z0=100.0):
    E = e0 + (np.arange(cols) + 0.5) * cell
    N = n0 - (np.arange(rows) + 0.5) * cell
    X, Y = np.meshgrid(E, N)
    return z0 + gx * (X - e0) + gy * (Y - n0)


def test_a_written_geotiff_reads_back_with_its_place(tmp_path):
    h = plane()
    dem.write_geotiff(tmp_path / "d.tif", h, 1000.0, 2000.0, 1.0)
    back, e0, n0, cell, nodata = dem.read_geotiff(tmp_path / "d.tif")
    assert back.shape == h.shape and np.allclose(back, h, atol=1e-3)
    assert (e0, n0, cell, nodata) == (1000.0, 2000.0, 1.0, dem.NODATA)
    from PIL import Image
    assert Image.open(tmp_path / "d.tif").size == (50, 40), "a TIFF other tools read too"


def test_heights_are_sampled_bilinearly_and_exact_on_a_plane(tmp_path):
    d = dem.Dem(plane(), 1000.0, 2000.0, 1.0, origin=(1020.0, 1980.0))
    for x, y in ((0.0, 0.0), (3.3, -7.7), (-12.25, 5.5)):
        e, n = 1020.0 + x, 1980.0 + y
        assert d.z(x, y) == pytest.approx(100 + 0.1 * (e - 1000) + 0.2 * (n - 2000), abs=1e-6)


def test_holes_are_filled_from_their_neighbours():
    h = plane()
    h[10:13, 10:13] = dem.NODATA
    d = dem.Dem(h, 1000.0, 2000.0, 1.0, origin=(1000.0, 2000.0), nodata=dem.NODATA)
    assert np.all(d.h > 50) and d.h[11, 11] == pytest.approx(plane()[11, 11], abs=0.5)


def test_the_fall_line_of_a_plane():
    d = dem.Dem(plane(gx=0.0, gy=-0.25), 1000.0, 2000.0, 1.0, origin=(1020.0, 1980.0))
    grade, up, z0 = d.fall_line()
    assert grade == pytest.approx(0.25) and up[1] == pytest.approx(-1.0) and abs(up[0]) < 1e-9
    assert z0 == pytest.approx(d.z(0.0, 0.0), abs=1e-6)


def test_permademo_relief_is_generated_on_its_invented_relief():
    """The public relief site's ground is its elevation model (an invented one: no real place), the rovers' plane is
    fitted to it, and every post and the nest stay reachable (generate stops otherwise). PermaDemo keeps its plane."""
    import generate_world
    with open(os.path.join(ROOT, "sites", "permademo-relief", "site.json")) as fh:
        site = json.load(fh)
    assert site["terrain"]["dem"]["origin"] == [100000.0, 100000.0], "an invented origin"
    with open(os.path.join(ROOT, "sites", "permademo", "site.json")) as fh:
        assert "dem" not in json.load(fh)["terrain"], "the reference stays on its plane"
    generate_world.generate(generate_world.site_path("permademo-relief"))
    t = np.load(os.path.join(ROOT, "worlds", "terrain.npz"))
    with open(os.path.join(ROOT, "site_config.json")) as fh:
        cfg = json.load(fh)
    assert str(t["source"]) == "dem" and cfg["terrain"]["source"] == "dem"
    assert cfg["terrain"]["grade"] == pytest.approx(0.25, abs=0.02), "the fitted slope of the demo's plane"
    d = dem.Dem.load(os.path.join(ROOT, "sites", "permademo-relief"), site["terrain"]["dem"])
    x0, y0, s = float(t["x0"]), float(t["y0"]), float(t["spacing"])
    i, j = 10, 20                                     # a point at the bbox's edge: no pad, bench or pond there
    assert t["heights"][j, i] == pytest.approx(d.z(x0 + i * s, y0 + j * s), abs=1e-3)
    generate_world.generate(generate_world.site_path("permademo-relief"), plane=True)
    assert str(np.load(os.path.join(ROOT, "worlds", "terrain.npz"))["source"]) == "plane"
    generate_world.generate(generate_world.site_path("permademo"))     # leave the default world as it was


def test_fetch_refuses_a_site_inside_this_repository(tmp_path):
    import subprocess
    out = subprocess.run([sys.executable, os.path.join(ROOT, "tools", "fetch_ign.py"), "--site",
                          os.path.join(ROOT, "sites", "permademo", "site.json")], capture_output=True, text=True)
    assert out.returncode != 0 and "refused" in (out.stdout + out.stderr)
