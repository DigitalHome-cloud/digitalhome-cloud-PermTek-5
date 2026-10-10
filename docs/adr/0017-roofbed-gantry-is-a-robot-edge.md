# ADR 0017 — The roof-bed gantry is a robot edge that works the habitat's cells

Status: **Accepted (design; nothing built yet)** · 2026-10-10 · Builds on [ADR 0016](0016-habitat-model-zones-beds-cells-trees.md), [ADR 0011](0011-nest-is-an-iot-edge-rovers-robot-edges.md)

## Context

The first habitat has a 1 m × 3 m class roof bed. A FarmBot-like gantry
should sow, water and watch it. FarmBot's own stack (its web app, its
firmware) would be a second cloud and a second model of the bed. We already
have the bed as cells in the habitat's A-Box (ADR 0016) and an edge layer
that links a device to a tenant, syncs the A-Box and works offline
(template-dlab5-edge, ADR-0006/0007).

## Decision

1. **A DIY gantry with our own controller**: a Raspberry Pi running ROS 2 and
   a robot edge generated from template-dlab5-edge with `edge_kind=robot`. It
   is the first instance of the blueprint's robot kind; the rovers of ADR 0011
   follow the same shape later.
2. **The A-Box is the plan; the edge holds the machine.**
   - What to grow where, how deep, how many seeds, the spacing and the water
     come from the habitat's graph (crops and cells, `sowingJob()` in
     `packages/core`).
   - Calibration (where the bed's corner and the soil surface are in the
     gantry's frame, tool offsets, speeds, limits) stays on the edge and never
     syncs up.
3. **The robot proposes, a person confirms.** The edge derives jobs from the
   cells and the calendar and shows them. Nothing moves until the owner
   confirms the job or has approved a **standing rule** for that kind of job
   (e.g. "water when the probe says dry, at most once a day").
4. **It runs without the cloud.** After a sync the edge has everything; it
   queues observations and status changes and uploads them when it can.
5. **Results are observations and status changes.** A sown cell becomes
   `CellSown` with its date. Photos and probe readings are
   `sosa:Observation`s about the cell. The edge writes through the same
   versioned graph save as the app, so a conflict is merged, never
   overwritten.
6. **Safety is local and physical first**: an e-stop that cuts motor power,
   limit switches, soft limits equal to the bed, a wind and frost lockout,
   and no motion while the lid or the area is occupied.
   See `docs/specs/roofbed-robot.md`.

## Consequences

- No FarmBot account, firmware or web app; the price is building motion
  control ourselves (ROS 2 with ros2_control, or a GRBL-class board behind a
  ROS 2 driver: decided when the hardware is chosen).
- The bed's grid (10 cm cells, row 1 / column 1 at the gantry's home corner)
  is a contract between the app and the robot. Changing a bed's cell size
  after planting moves every cell.
- A Webots twin of the gantry over CityDemo comes before any hardware moves
  (rule: twin before garden), reusing the twin's ROS 2 setup (ADR 0014).
- The edge wire contract (`docs/specs/edge-cloud-api.md`) needs no new route
  for this: graph sync and telemetry are enough. Photos need object upload,
  which the template's edge models/object routes cover or a later route adds.
