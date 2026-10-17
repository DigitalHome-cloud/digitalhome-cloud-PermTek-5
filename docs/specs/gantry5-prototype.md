# Gantry5 prototype: the bench first

Status: **design** · 2026-10-17 · [ADR 0032](../adr/0032-bench-gantry-first-cad-as-code.md) · robot: [roofbed-robot.md](roofbed-robot.md) · model: `hardware/gantry5/`

The first physical gantry is a small one on a table. It proves what the roof gantry needs, at a fraction of the cost
and with nothing on the roof:
- homing and limits;
- the e-stop;
- the watering nozzle;
- the real driver behind the edge's Confirm.

Then we choose: our own full-size frame (the `full` variant), or a FarmBot Express kit driven by our edge.

## 1. What is built

The parametric model in `hardware/gantry5/` writes the assembly (STEP), the plates (DXF to cut, STL to print) and the
bill of materials. The variants:

- **`bench`:** 1000 × 600 mm of travel over a 100 mm seed tray, rails on four posts on the table, one x motor. Plates
  printed in PETG or cut from 12 mm birch plywood.
- **`full`:** 3200 × 1150 mm over the 3 m × 1.2 m bed (200 mm to park the tools beyond it), rails 650 mm above the
  soil.
  - Eight posts, bolted to the outside of the long boards.
  - Two x motors, squared by a switch on each side.
  - Plates cut from 6 mm aluminium.

The motion board is an ESP32 running **FluidNC**, with TMC2209 drivers; it speaks G-code over USB to the Pi 5. FluidNC
gangs two x motors, homes each side to its own switch (squaring the bridge), and has a coolant output that
switches the valve.

## 2. Bench build, in order

1. **Frame:** cut the extrusions (`bom-bench.csv`), stand the posts, fit the x rails and the bridge. Wheels on
   eccentric spacers take up play: snug, rolling without slack.
2. **Axes:** motors, belts, lead screw. One axis at a time from the FluidNC web page: steps per mm, then speed and
   acceleration that never skip.
3. **Homing and limits:** a switch per axis. Soft limits = the tray plus the park zone; z never lower than
   `reachBelowSoil`.
4. **E-stop, wired before anything else moves on its own** (spec §5):
   - the mushroom's NC contact holds the contactor's coil;
   - the contactor switches the motors' 24 V and the valve's 24 V;
   - pressed: both are cut in hardware, whatever the software does;
   - the Pi and the controller's logic stay powered, so they can report the stop.
5. **Nozzle:** the normally closed valve through its relay on the coolant output, the flow meter counted, a daily
   cap in the driver.
6. **The edge's driver:** a ROS node offering the topics the twin's driver offers (`bed_actions`), sending G-code
   over USB. A job comes only from a proposal a person confirmed.
7. **Then the probe and the camera**, as in the twin.

## 3. When the bench has done its job

- **Homing:** 20 homings in a row land within ±0.5 mm.
- **E-stop:** pressing it stops motion and water at once, in every state, and nothing moves again until it is
  released and a person confirms.
- **One watering job:** done end to end, from a confirmed proposal on the edge's page, with the volume measured.
- **Reach:** the twin's cell positions (`sowingJob`) are reached on the tray.

## 4. Wood for the bed

- **Which wood:** untreated heartwood of **larch** or **Douglas fir** for the frame and the worm box (durability class
  3, lasting years outdoors). **Robinia** (black locust) or **oak** last longer still, if a local sawmill has them.
- **What to avoid:** pressure-treated or oil-treated wood, and painted boards, where food grows and worms live;
  freshly cut softwood with a lot of sapwood, which rots first.
- **Boards:** 45 × 195 mm. The 30 mm in `roofbed-system.md` bows over 3 m of wet substrate. Posts 70 × 70 mm inside
  the corners, and where a tie rod crosses.
- **Ties:** a stainless M10 tie rod across every metre, at half the substrate's depth. It holds the long sides
  against the soil's push.
- **Under it:** a liner inside the frame, and the roof's protection mat under it all (`roofbed-system.md`).
- **The rails are aluminium, never wood:** wood moves with the weather, and the gantry's positions would move with
  it.
- **Cut list:** `hardware/gantry5/cutlist-full.csv`.

## 5. Kits, for comparison

**FarmBot Express:**
- **Size:** 1.2 m × 3 m, plants up to 0.5 m: the same size as our bed.
- **Price:** about $1,800–2,300 without the bed (2026 estimates).
- **Openness:** its CAD and BOM are open.
- **If we took it:** we would drive its Farmduino from our ROS driver instead of FarmBot OS, so the edge, its Confirm
  and its logbook stay.
- **To check before buying:** its rail height against `GANTRY5` and how it holds in roof wind.

The bench comes first in either case. The driver, the e-stop wiring and the nozzle carry over.
