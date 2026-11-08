#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Gantry5-gen1 as code: the parts, the assembly, the drawings and the bill of materials, from params.json.

    python gantry5.py                 both variants: build/ (STEP, STL, DXF) and the committed CSVs
    python gantry5.py --variant bench
    python gantry5.py --csv-only      only the BOM and cut list (fast; what the drift test compares)

Variants (params.json): "bench", a table-top gantry over a seed tray, and "full", over the 3 m x 1.2 m bed on its
wooden frame (docs/specs/gantry5-prototype.md, ADR 0032). Millimetres; x along the bed, y across, z up from the soil.

The extrusions are drawn as their outer boxes, the plates exactly (outline and holes: what is cut). Wheel hole
spacings follow the common V-slot mini wheels; check them against the wheels you have before cutting.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import math
import os
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

HERE = os.path.dirname(os.path.abspath(__file__))
BUILD = os.path.join(HERE, "build")

PROFILES = {"vslot-2020": (20, 20), "vslot-2040": (20, 40), "vslot-2060": (20, 60)}
WHEEL_OVER = 19.6           # wheel centres sit this much wider than the profile face they run on (mini V wheels)
WHEEL_HOLE, ECCENTRIC_HOLE = 5.2, 7.2
M5, M3, M2 = 5.5, 3.4, 2.4
NEMA17_BOSS, NEMA17_HOLES = 22.5, 31.0
CARRIAGE = 150              # x carriage plate length along the rail
TOOL_BELOW_Z = 60           # the tool's tip below the z carriage
BELT_SPARE, CHAIN_SPARE = 300, 300


def load(path: str) -> dict:
    with open(path) as fh:
        return json.load(fh)


@dataclass
class Plate:
    """A flat part, cut (DXF) or printed (STL): an outline and its round holes (x, y, diameter) from its centre."""
    id: str
    name: str
    size: Tuple[float, float]
    holes: List[Tuple[float, float, float]]
    qty: int
    note: str = ""

    def face(self):
        from build123d import BuildSketch, Circle, Locations, Mode, Rectangle
        with BuildSketch() as s:
            Rectangle(*self.size)
            for x, y, d in self.holes:
                with Locations((x, y)):
                    Circle(d / 2, mode=Mode.SUBTRACT)
        return s.sketch


@dataclass
class Design:
    variant: str
    p: dict
    travel: Tuple[float, float, float]
    rail_spacing: float
    rail_len: float
    bridge_len: float
    column_len: float
    post_len: float
    posts: int
    clearance: float                       # tool tip over the soil, z axis up
    lowest_tip: float                      # tool tip at the bottom of z travel (negative: into the soil)
    plates: List[Plate] = field(default_factory=list)
    boards: List[dict] = field(default_factory=list)


def design(variant: str, params: Optional[dict] = None) -> Design:
    p = (params or load(os.path.join(HERE, "params.json")))[variant]
    bed = p.get("bed")
    if bed:
        board_t = bed["board"][0]
        rail_spacing = bed["width"] + 2 * board_t + 20            # posts bolted to the long boards' outer faces
        travel_x = bed["length"] + p["park"]
        travel_y = rail_spacing - 160                             # less the y carriage and the bridge's ends
        posts_per_side = math.ceil(bed["length"] / p["postSpacing"]) + 1
        post_base = p["rimAboveSoil"] - bed["board"][1]          # down to the boards' bottom edge
    else:
        travel_x, travel_y = p["travel"]
        rail_spacing = travel_y + 160
        posts_per_side = p["postsPerSide"]
        post_base = -p["soilAboveBase"]
    rail_h = PROFILES["vslot-2040"][1]
    clearance = p["railAboveSoil"] - p["zStack"]
    travel_z = clearance + p["reachBelowSoil"]
    d = Design(
        variant=variant, p=p, travel=(travel_x, travel_y, travel_z), rail_spacing=rail_spacing,
        rail_len=travel_x + CARRIAGE + 2 * 20, bridge_len=rail_spacing + 40, column_len=travel_z + 200,
        post_len=p["railAboveSoil"] - rail_h - post_base, posts=2 * posts_per_side,
        clearance=clearance, lowest_tip=clearance - travel_z)
    d.plates = plates(d)
    d.boards = boards(d) if bed else []
    return d


def wheels(face: float, along: float) -> List[Tuple[float, float, float]]:
    """Four wheels round a profile face: two fixed, two on eccentric spacers to take up play."""
    a, c = along / 2, (face + WHEEL_OVER) / 2
    return [(-a, c, WHEEL_HOLE), (a, c, WHEEL_HOLE), (-a, -c, ECCENTRIC_HOLE), (a, -c, ECCENTRIC_HOLE)]


def nema17(at=(0.0, 0.0)) -> List[Tuple[float, float, float]]:
    x, y = at
    h = NEMA17_HOLES / 2
    return [(x, y, NEMA17_BOSS)] + [(x + sx * h, y + sy * h, M3) for sx in (-1, 1) for sy in (-1, 1)]


def bolts(dx: float, dy: float, d: float = M5, at=(0.0, 0.0)) -> List[Tuple[float, float, float]]:
    x, y = at
    return [(x + sx * dx / 2, y + sy * dy / 2, d) for sx in (-1, 1) for sy in (-1, 1)]


def plates(d: Design) -> List[Plate]:
    x_motors = 2 if d.p["dualX"] else 1
    out = [
        Plate("x-carriage", "x carriage plate (rides a 2040 rail, carries the bridge)", (CARRIAGE, 40 + WHEEL_OVER + 40),
              wheels(40, 110) + bolts(40, 20), 2, "one per rail"),
        Plate("y-carriage", "y carriage plate (rides the 2060 bridge, carries the z column)", (130, 60 + WHEEL_OVER + 40),
              wheels(60, 90) + bolts(20, 40), 1),
        Plate("z-carriage", "z plate (rides the 2020 column, holds the lead-screw nut and the tool plate)", (90, 20 + WHEEL_OVER + 30),
              wheels(20, 60) + [(0, 0, 10.5)] + bolts(60, 20, M3, at=(0, 0)), 1),
        Plate("motor-x", "x motor mount", (90, 70), nema17((-10, 0)) + [(32, 20, M5), (32, -20, M5)], x_motors,
              "one per x motor" if x_motors > 1 else ""),
        Plate("motor-y", "y motor mount", (90, 70), nema17((-10, 0)) + [(32, 20, M5), (32, -20, M5)], 1),
        Plate("motor-z", "z motor mount on the column's top", (70, 70), nema17() + bolts(50, 50, M5), 1),
        Plate("tool", "tool plate: nozzle, soil probe, camera", (110, 80),
              [(-30, 15, 16.0), (0, 15, 12.0)] + bolts(21, 12.5, M2, at=(32, 15)) + bolts(60, 20, M3, at=(0, -22)), 1,
              "nozzle 16 mm, probe 12 mm, camera Pi Camera 3 (21 x 12.5 mm)"),
    ]
    return out


def boards(d: Design) -> List[dict]:
    """The bed's wooden frame: long boards, end boards, posts and the tie rods across the middle."""
    bed = d.p["bed"]
    t, h = bed["board"]
    courses = math.ceil((bed["substrateDepth"] + d.p["rimAboveSoil"]) / h)
    ties = max(0, math.ceil(bed["length"] / bed["tieRodEvery"]) - 1)
    pw = bed["post"][0]
    out = [
        {"id": "board-long", "name": "long side board", "stock": "larch-45x195", "qty": 2 * courses, "length": bed["length"] + 2 * t},
        {"id": "board-end", "name": "end board (between the long ones)", "stock": "larch-45x195", "qty": 2 * courses, "length": bed["width"]},
        {"id": "post-corner", "name": "corner post, inside", "stock": "larch-70x70", "qty": 4, "length": courses * h},
        {"id": "post-tie", "name": "post where a tie rod crosses, inside", "stock": "larch-70x70", "qty": 2 * ties, "length": courses * h},
        {"id": "tie-rod", "name": "tie rod across, at half the substrate's depth", "stock": "tie-rod-m10", "qty": ties,
         "length": bed["width"] + 2 * t + 2 * pw + 40},
    ]
    return [b for b in out if b["qty"]]


# ------------------------------------------------------------------------------------------- bill of materials --

def bom(d: Design, parts: Optional[dict] = None) -> List[dict]:
    parts = parts or load(os.path.join(HERE, "parts.json"))
    mats, items = parts["materials"], parts["items"]
    rows: List[dict] = []

    def stock(pid, name, qty, length, stock_id, made="cut to length"):
        m = mats[stock_id]
        rows.append({"part": pid, "name": name, "qty": qty, "size": f"{length:.0f} mm", "material": m["name"], "made": made,
                     "supplier": m["supplier"], "eur_each": round(m["eur"] * length / 1000, 2)})

    def buy(item_id, qty, size=""):
        if qty:
            it = items[item_id]
            rows.append({"part": item_id, "name": it["name"], "qty": qty, "size": size, "material": "", "made": "buy",
                         "supplier": it["supplier"], "eur_each": it["eur"]})

    x_motors = 2 if d.p["dualX"] else 1
    tx, ty, tz = d.travel
    stock("x-rail", "x rail", 2, d.rail_len, "vslot-2040")
    stock("y-bridge", "y bridge", 1, d.bridge_len, "vslot-2060")
    stock("z-column", "z column", 1, d.column_len, "vslot-2020")
    stock("post", "post under the x rails", d.posts, d.post_len, "vslot-2040")
    plate_m = mats[d.p["plateMaterial"]]
    for pl in d.plates:
        area = pl.size[0] * pl.size[1] / 1e6
        rows.append({"part": pl.id, "name": pl.name, "qty": pl.qty, "size": f"{pl.size[0]:.0f} x {pl.size[1]:.0f} mm",
                     "material": plate_m["name"], "made": "cut from dxf/" + pl.id + ".dxf (or print stl/)",
                     "supplier": plate_m["supplier"], "eur_each": round(max(area * plate_m["eur"], 2.0), 2)})
    for b in d.boards:
        stock(b["id"], b["name"], b["qty"], b["length"], b["stock"])
    carriages = 2 + 1 + 1
    buy("v-wheel", 4 * carriages)
    buy("eccentric-spacer", 2 * carriages)
    buy("nema17", x_motors + 2)
    buy("gt2-pulley", x_motors + 1)
    buy("gt2-idler", x_motors + 1)
    belt = x_motors * (2 * d.rail_len + BELT_SPARE) + 2 * d.bridge_len + BELT_SPARE
    stock("belt", "GT2 belts, x and y", 1, belt, "gt2-belt", made="cut to length")
    buy("t8-screw", 1, f"{tz + 100:.0f} mm")
    buy("end-switch", 3 + (1 if d.p["dualX"] else 0), "one per axis; the second x side squares the bridge")
    chain = (tx / 2 + CHAIN_SPARE) + (ty / 2 + CHAIN_SPARE)
    stock("drag-chain", "drag chains, x and y", 1, chain, "drag-chain", made="cut to length")
    stock("cable", "motor, switch and sensor cable", 1, 2 * (tx + ty + tz) + 2000 * (x_motors + 2), "cable-4core", made="cut to length")
    buy("corner-bracket", 2 * d.posts + 4)
    for item in ("controller", "pi5", "pi-ssd", "psu-24v", "estop", "contactor", "valve", "valve-relay", "flow-meter",
                 "nozzle", "soil-probe", "camera", "enclosure", "fasteners"):
        buy(item, 1)
    if d.p.get("bed"):
        bed = d.p["bed"]
        outer = (bed["length"] + 2 * bed["board"][0]) * (bed["width"] + 2 * bed["board"][0]) / 1e6
        buy("liner", math.ceil(outer + 2 * (bed["length"] + bed["width"]) * bed["board"][1] / 1e6), "m2, floor and sides")
        buy("protection-mat", math.ceil(outer), "m2")
    return rows


def total(rows: List[dict]) -> float:
    return round(sum(r["qty"] * r["eur_each"] for r in rows), 2)


COLUMNS = ["part", "name", "qty", "size", "material", "made", "supplier", "eur_each"]


def bom_csv(d: Design) -> str:
    rows = bom(d)
    out = io.StringIO()
    w = csv.DictWriter(out, COLUMNS, lineterminator="\n")
    w.writeheader()
    w.writerows(rows)
    w.writerow({"part": "total", "name": f"estimate, {load(os.path.join(HERE, 'parts.json'))['pricesChecked']}",
                "eur_each": total(rows)})
    return out.getvalue()


def cutlist_csv(d: Design) -> str:
    out = io.StringIO()
    w = csv.writer(out, lineterminator="\n")
    w.writerow(["part", "name", "qty", "length_mm", "stock"])
    for b in d.boards:
        w.writerow([b["id"], b["name"], b["qty"], round(b["length"]), b["stock"]])
    return out.getvalue()


# ------------------------------------------------------------------------------------------------ geometry --

def assembly(d: Design):
    """The machine in its home pose (z up), with the bed's frame for the full variant: a STEP to look at and to
    check clearances. Extrusions are their outer boxes."""
    from build123d import Align, Box, Compound, Location, extrude
    MIN = (Align.CENTER, Align.CENTER, Align.MIN)
    kids = []
    rail_h = PROFILES["vslot-2040"][1]
    rail_top = d.p["railAboveSoil"]
    x0 = -CARRIAGE / 2 - 20
    for i, y in enumerate((0.0, d.rail_spacing)):
        kids.append(_label(Box(d.rail_len, 20, rail_h, align=(Align.MIN, Align.CENTER, Align.MIN)).moved(
            Location((x0, y, rail_top - rail_h))), f"x-rail-{i + 1}"))
        n = d.posts // 2
        bed = d.p.get("bed")                 # on the bed, the posts stand along the long boards; on the bench, the rail
        first, last = ((-bed["board"][0], bed["length"] + bed["board"][0] - 40) if bed else (x0 + 30, x0 + d.rail_len - 70))
        for k in range(n):
            px = first + k * (last - first) / max(1, n - 1)
            base = rail_top - rail_h - d.post_len
            kids.append(_label(Box(40, 20, d.post_len, align=MIN).moved(Location((px, y, base))), f"post-{i + 1}-{k + 1}"))
    bridge_z = rail_top + 10
    kids.append(_label(Box(20, d.bridge_len, 60, align=(Align.CENTER, Align.MIN, Align.MIN))
                       .moved(Location((0, -20, bridge_z))), "y-bridge"))
    # the z column hangs from the y carriage; its tool tip sits zStack below the rail top when up
    tip = rail_top - d.p["zStack"]
    col_bottom = tip + TOOL_BELOW_Z
    kids.append(_label(Box(20, 20, d.column_len, align=MIN).moved(Location((30, d.rail_spacing / 2, col_bottom))), "z-column"))
    kids.append(_label(Box(12, 12, TOOL_BELOW_Z, align=MIN).moved(Location((30, d.rail_spacing / 2 + 25, tip))), "tool-tip"))
    plate_t = 6 if d.p["plateMaterial"].startswith("aluminium") else 12
    for i, y in enumerate((-10, d.rail_spacing + 10 + plate_t)):    # outside each rail (the extrusion runs to -y)
        f = d.plates[0].face()
        kids.append(_label(extrude(f, amount=plate_t).moved(Location((0, y, rail_top - rail_h / 2), (90, 0, 0))),
                           f"x-carriage-{i + 1}"))
    for b in _frame(d):
        kids.append(b)
    return Compound(children=kids, label=f"gantry5-{d.variant}")


def _label(shape, name):
    shape.label = name
    return shape


def _frame(d: Design):
    from build123d import Align, Box, Location
    bed = d.p.get("bed")
    if not bed:
        tray = Box(d.travel[0], d.travel[1], d.p["soilAboveBase"], align=(Align.MIN, Align.MIN, Align.MIN))
        return [_label(tray.moved(Location((0, (d.rail_spacing - d.travel[1]) / 2, -d.p["soilAboveBase"]))), "seed-tray")]
    t, h = bed["board"]
    top = d.p["rimAboveSoil"]
    y0 = (d.rail_spacing - bed["width"]) / 2 - t
    out = []
    for i, y in enumerate((y0, y0 + bed["width"] + t)):
        out.append(_label(Box(bed["length"] + 2 * t, t, h, align=(Align.MIN, Align.MIN, Align.MAX))
                          .moved(Location((-t, y, top))), f"board-long-{i + 1}"))
    for i, x in enumerate((-t, bed["length"])):
        out.append(_label(Box(t, bed["width"], h, align=(Align.MIN, Align.MIN, Align.MAX))
                          .moved(Location((x, y0 + t, top))), f"board-end-{i + 1}"))
    return out


def write(d: Design, geometry: bool = True) -> Dict[str, str]:
    """The committed CSVs next to this file; with geometry, STEP, STL and DXF into build/<variant>/."""
    written = {}
    for name, text in ((f"bom-{d.variant}.csv", bom_csv(d)), *(((f"cutlist-{d.variant}.csv", cutlist_csv(d)),) if d.boards else ())):
        path = os.path.join(HERE, name)
        with open(path, "w") as fh:
            fh.write(text)
        written[name] = path
    if not geometry:
        return written
    from build123d import ExportDXF, Unit, export_step, export_stl, extrude
    out = os.path.join(BUILD, d.variant)
    os.makedirs(os.path.join(out, "dxf"), exist_ok=True)
    os.makedirs(os.path.join(out, "stl"), exist_ok=True)
    plate_t = 6 if d.p["plateMaterial"].startswith("aluminium") else 12
    for pl in d.plates:
        face = pl.face()
        dxf = ExportDXF(unit=Unit.MM)
        dxf.add_layer("cut")
        dxf.add_shape(face, layer="cut")
        dxf.write(os.path.join(out, "dxf", f"{pl.id}.dxf"))
        export_stl(extrude(face, amount=plate_t), os.path.join(out, "stl", f"{pl.id}.stl"))
    step = os.path.join(out, f"gantry5-{d.variant}.step")
    export_step(assembly(d), step)
    written["step"] = step
    return written


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.strip().splitlines()[0])
    ap.add_argument("--variant", choices=("bench", "full", "all"), default="all")
    ap.add_argument("--csv-only", action="store_true", help="only the BOM and the cut list")
    a = ap.parse_args()
    for v in (("bench", "full") if a.variant == "all" else (a.variant,)):
        d = design(v)
        w = write(d, geometry=not a.csv_only)
        print(f"  {v}: travel {d.travel[0]:.0f} x {d.travel[1]:.0f} x {d.travel[2]:.0f} mm, tool {d.clearance:.0f} mm over the soil, "
              f"estimate EUR {total(bom(d)):.0f}; " + ", ".join(os.path.relpath(p, HERE) for p in w.values()))


if __name__ == "__main__":
    main()
