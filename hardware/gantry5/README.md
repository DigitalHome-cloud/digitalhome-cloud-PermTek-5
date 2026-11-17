# Gantry5: the robot's hardware as code

The roof bed's gantry (`docs/specs/roofbed-robot.md`) as a parametric model: one script writes the 3D assembly,
the drawings to cut its plates, and the bill of materials, for two variants (ADR 0032).

| Variant | What | Travel x × y × z | Estimate |
|---|---|---|---|
| `bench` | a table-top gantry over a seed tray, to prove homing, limits, the e-stop, the nozzle and the driver | 1000 × 600 × 130 mm | see `bom-bench.csv` |
| `full` | over the 3 m × 1.2 m bed, rails 650 mm above the soil on posts bolted to the wooden frame | 3200 × 1150 × 500 mm | see `bom-full.csv` |

The full variant's tool clears the soil by `GANTRY5.toolClearanceCm` (`packages/core/src/wormbed5.ts`); a test
keeps the two equal, because the planner refuses plants taller than that.

## Make it

```bash
cd hardware/gantry5
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/python gantry5.py              # both variants
.venv/bin/python gantry5.py --csv-only   # only the BOM and the cut list (after changing params.json or parts.json)
.venv/bin/python -m pytest -q tests
```

It writes:

- **`build/<variant>/gantry5-<variant>.step`**: the assembly in its home pose (open it in FreeCAD or any STEP viewer).
- **`build/<variant>/dxf/*.dxf`**: each plate's outline and holes, in millimetres, for a cutting service, a CNC, or to
  print 1:1 as a template.
- **`build/<variant>/stl/*.stl`**: the same plates to 3D-print, which is good enough for the bench.
- **`bom-<variant>.csv`** and **`cutlist-full.csv`** (committed): what to buy and cut, with estimated prices.

`build/` is not committed; the CSVs are, and a test fails when they differ from what the code writes.

## Change it

- **Sizes:** `params.json` (travel, rail height, the bed, which plate material).
- **What is bought, and its price:** `parts.json`. Prices are estimates dated in the file; check them before
  ordering.
- **The parts and how they fit:** `gantry5.py`. The extrusions are drawn as their outer boxes; the plates exactly.
- **Wheels:** the wheel hole spacing (`WHEEL_OVER`) follows the common V-slot mini wheels. Check it against the
  wheels you have before cutting.

Building it, wiring the e-stop and choosing the wood: `docs/specs/gantry5-prototype.md`.
