# SPDX-License-Identifier: GPL-3.0-or-later
"""Gantry5's parametric model (ADR 0032): it reaches the bed, clears the plants as the core says, its drawings have
the outlines its BOM names, and the committed BOM and cut list are what the code writes."""
import os
import re
import sys

import pytest

HERE = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)
import gantry5 as g  # noqa: E402


def core_gantry():
    """GANTRY5 in packages/core/src/wormbed5.ts: what the site tells the planner (too tall for the gantry)."""
    with open(os.path.join(REPO, "packages", "core", "src", "wormbed5.ts")) as fh:
        m = re.search(r"GANTRY5 = \{ railAboveSoilCm: (\d+), toolClearanceCm: (\d+) \}", fh.read())
    return int(m[1]) * 10, int(m[2]) * 10


def test_the_full_gantry_is_the_one_the_core_plans_with():
    d = g.design("full")
    rail, clearance = core_gantry()
    assert d.p["railAboveSoil"] == rail
    assert d.clearance == clearance, "plants taller than this are refused by the planner"


def test_the_full_gantry_reaches_every_cell_and_parks_beyond_the_bed():
    d = g.design("full")
    bed = d.p["bed"]
    assert d.travel[0] >= bed["length"] + 100, "room to park the tools off the bed"
    assert d.travel[1] >= bed["width"] - 100, "the cells' centres lie 50 mm in from each side"
    assert d.lowest_tip <= -50, "the probe goes into the soil"
    assert d.post_len > 0 and d.posts == 8


def test_the_bench_works_over_its_tray():
    d = g.design("bench")
    assert d.travel[:2] == (1000, 600)
    assert d.clearance > 0 and d.lowest_tip == -d.p["reachBelowSoil"]
    assert not d.boards and not d.p["dualX"]


@pytest.mark.parametrize("variant", ["bench", "full"])
def test_the_bom_adds_up_and_names_every_plate(variant):
    d = g.design(variant)
    rows = g.bom(d)
    assert g.total(rows) == round(sum(r["qty"] * r["eur_each"] for r in rows), 2)
    ids = {r["part"] for r in rows}
    assert {p.id for p in d.plates} <= ids
    assert {"estop", "contactor", "controller", "valve"} <= ids, "the e-stop and its contactor are never optional"
    motors = next(r for r in rows if r["part"] == "nema17")["qty"]
    assert motors == (4 if d.p["dualX"] else 3)


def test_the_full_frame_is_cut_from_boards_with_ties_across():
    d = g.design("full")
    cut = {b["id"]: b for b in d.boards}
    assert cut["board-long"]["length"] == 3090 and cut["board-end"]["length"] == 1200
    assert cut["tie-rod"]["qty"] == 2, "every metre along a 3 m bed"


@pytest.mark.parametrize("variant", ["bench", "full"])
def test_the_committed_bom_and_cut_list_are_what_the_code_writes(variant):
    d = g.design(variant)
    with open(os.path.join(HERE, f"bom-{variant}.csv")) as fh:
        assert fh.read() == g.bom_csv(d), "run: python gantry5.py --csv-only"
    if d.boards:
        with open(os.path.join(HERE, f"cutlist-{variant}.csv")) as fh:
            assert fh.read() == g.cutlist_csv(d)


def test_a_plates_drawing_has_its_outline_and_holes(tmp_path):
    ezdxf = pytest.importorskip("ezdxf")
    from build123d import ExportDXF, Unit
    plate = next(p for p in g.design("bench").plates if p.id == "tool")
    dxf = ExportDXF(unit=Unit.MM)
    dxf.add_layer("cut")
    dxf.add_shape(plate.face(), layer="cut")
    dxf.write(str(tmp_path / "tool.dxf"))
    doc = ezdxf.readfile(str(tmp_path / "tool.dxf"))
    ext = ezdxf.bbox.extents(doc.modelspace())
    assert round(ext.size.x) == plate.size[0] and round(ext.size.y) == plate.size[1]
    circles = [e for e in doc.modelspace() if e.dxftype() == "CIRCLE"]
    assert len(circles) == len(plate.holes)
    assert doc.header["$INSUNITS"] == 4, "millimetres"


def test_the_assembly_puts_the_tool_where_the_clearance_says():
    d = g.design("full")
    tip = next(c for c in g.assembly(d).children if c.label == "tool-tip")
    assert tip.bounding_box().min.Z == pytest.approx(d.clearance)
