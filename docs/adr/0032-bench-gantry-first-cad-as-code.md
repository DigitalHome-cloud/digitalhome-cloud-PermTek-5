# ADR 0032: A bench gantry first, its CAD as code

Status: **Accepted** · 2026-10-17 · Builds on [ADR 0017](0017-roofbed-gantry-is-a-robot-edge.md), [ADR 0018](0018-twin-edge-for-the-gantry.md)

## Context

**The gantry exists only as a twin** (Webots and ROS 2, `permtek5-twin-edge`). Building the real one raises four
questions:
- whether to start from a kit;
- which tool draws it;
- where its bill of materials comes from;
- what to build first.

A full-size gantry on a roof is the expensive place to learn homing, wiring and the e-stop.

## Decision

1. **A bench gantry first.** It is about 1 m × 0.6 m on a table, over a seed tray. It proves homing, limits, the
   e-stop, the watering nozzle and the real driver behind the edge's Confirm. Only then is the full size chosen:
   - our own frame (the model's `full` variant);
   - or a FarmBot Express, the same 1.2 m × 3 m, driven from our edge instead of FarmBot OS.
2. **The CAD is code: build123d, in `hardware/gantry5/`.**
   - One script and two parameter files write:
     - the assembly as STEP;
     - each plate as DXF (to cut) and STL (to print);
     - the BOM and the wood's cut list as CSV.
   - **Why the CSVs are committed:** like the twin's world, the drawings are made from numbers, never by hand. The
     CSVs are committed so they read on GitHub, and a test fails when they drift.
   - **Not Blender:** it models meshes, not solids. It has no STEP and a weak fit for a BOM. It stays for renders and
     films.
   - **Not FreeCAD:** a GUI model is hard to keep in step with the bed's numbers. It remains the viewer for the STEP.
3. **The motion board is an ESP32 running FluidNC** (TMC2209 drivers), speaking G-code over USB to the Pi 5. This
   answers the robot spec's open question for the bench.
   - **Why:** it gangs two x motors and squares them on their own switches; it switches the valve from its coolant
     output; and it is configured by a file.
   - **Not ros2_control:** a hardware interface is more than a bench needs.
4. **The e-stop is hardware.** A mushroom's NC contact holds a contactor that switches the motors' and the valve's
   24 V. It is in the BOM of both variants and never optional.
5. **The bed's wood:** untreated larch or Douglas fir heartwood, 45 mm boards, tie rods every metre. The rails are
   aluminium.

## Consequences

- **The full variant's tool clearance equals the core's `GANTRY5`.** A test checks it, so the planner's "too tall
  for the gantry" stays true to the machine.
- **Prices in `parts.json` are dated estimates.** The BOM's total is a planning figure, not a quote.
- **The real ROS driver** (a FluidNC node offering the twin's topics) is the next step, in the edge repository, once
  the bench is built.
- **The model is schematic:** extrusions are drawn as their outer boxes. Clearances and lengths are right, but the
  slot details are not.
