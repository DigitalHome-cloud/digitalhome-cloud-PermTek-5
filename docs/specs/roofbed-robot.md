# Roof-bed gantry robot: design

Status: **design; the twin exists (ADR 0018), no hardware yet** · ADR 0017 · model: ADR 0016

A FarmBot-like gantry over one growing bed on a flat roof. It sows, waters,
probes and photographs the bed's cells, from the habitat's A-Box, offline,
and only does what its owner confirmed.

## 1. The bed it works

| | |
|---|---|
| Bed | about 3 m × 1 m, substrate 20–30 cm, in a frame on the roof |
| Grid | square cells, 10 cm: 10 rows × 30 columns (ADR 0016) |
| Origin | the outer corner of row 1 / column 1 = the gantry's home corner |
| Axes | x along the length (columns), y across the width (rows), z down into the substrate; millimetres |
| A cell's point | its centre: x = (col − ½) × 100 mm, y = (row − ½) × 100 mm (1-based) |

`sowingJob(habitat, cell)` in `packages/core` gives exactly this per cell:
`xMm`, `yMm`, `depthMm`, `seeds`, `spacingMm`, `checkAfterDays`.

## 2. Hardware (to be chosen)

- **Frame**: aluminium extrusion; x rails on the bed's long sides, a y bridge,
  a z column. Travel a little larger than the bed, so tools can park outside.
- **Drive**: belts on x and y, a lead screw on z; steppers with encoders or
  closed-loop drivers; limit switches at both ends of each axis.
- **Tool head**, fixed tools first (a tool changer only if needed):
  - seeder: a vacuum needle picking single seeds from a tray;
  - watering nozzle with a solenoid valve and a flow meter;
  - soil probe: moisture and temperature, pushed in a few centimetres;
  - camera, pointing down, with a light.
- **Controller**: Raspberry Pi 5 (ROS 2 and the edge) plus a motion board
  (ros2_control hardware interface, or a GRBL-class board behind a driver).
- **Enclosure**: IP65 for electronics; UV-stable cables in drag chains.
- **Supply**: 24 V; water from a tank or a tap with a pressure reducer.

## 3. Software

```
cloud (PermTek-5)                     robot edge on the Pi (edge_kind=robot)
  habitat A-Box  ── graph sync ──►   edge: link, sync, jobs, MCP, local web page
  (cells, crops)  ◄── status, obs ──   │ proposes jobs, waits for confirmation
                                       ▼
                                     ROS 2
                                       gantry_driver   axes, homing, limits
                                       tools           seeder, valve, probe, camera
                                       bed_actions     plant_cell, water_cells, probe_cells, photo_pass
                                       safety          e-stop, soft limits, weather lockout
```

### ROS 2 actions (`bed_actions`)

| Action | Goal | Result |
|---|---|---|
| `plant_cell` | bed, row, col, crop, depth mm, seeds | sown (yes/no), seeds dropped, time |
| `water_cells` | list of cells with millilitres each | millilitres given per cell |
| `probe_cells` | list of cells | moisture and temperature per cell |
| `photo_pass` | bed, or a list of cells | one image per cell or strip, with its cell |

Each action first checks the safety node, homes if position is unknown, and
is cancellable. Feedback is the current cell.

### How much water

A crop wants `perma:waterMmPerWeek` (1 mm = 1 l/m²). Per plant and day:
`spacing² × mm/week ÷ 7`, minus the rain the area had (from DHC core's weather,
later a local rain gauge), corrected by the probe. Lettuce at 25 cm and
25 mm/week: about 220 ml a day without rain.

## 4. From plan to done

1. **Plan** (app): the owner plants cells on the map; status `planned`.
2. **Sync**: the edge pulls the A-Box (device flow link, versioned graph).
3. **Propose**: the edge lists jobs. Sowing: planned cells whose crop is in
   its sowing month (the calendar). Watering: from the rule above. Photo and
   probe passes: on a schedule.
4. **Confirm**: on the edge's local page (or later in the app), per job or by
   a standing rule the owner approved. No confirmation, no motion.
5. **Do**: ROS 2 actions, offline.
6. **Report**: a sown cell becomes `sown` with `sownOn`; after
   `germinationDays` a photo pass checks whether it came up; readings and
   photos are `sosa:Observation`s about the cell. Uploaded when online.
7. **Review** (app): the owner sees the bed's state, corrects it, harvests;
   harvested cells free the grid.

## 5. Safety

- **E-stop**: a mushroom button that cuts motor and valve power in hardware.
- **Limits**: switches on every axis; soft limits = the bed plus the park
  zone; z never below the substrate depth.
- **People**: the gantry moves slowly, with force limits; no motion while
  someone works in the bed (a switch on the lid or a "hands in the bed" button
  on the frame, later the camera).
- **Weather**: no motion above a wind limit; no watering near frost; park and
  power down in storms. Area weather from DHC core is advisory; a local wind
  or temperature sensor decides.
- **Water**: a leak sensor under the valve, a flow limit per job, a normally
  closed valve, a daily cap.
- **Roof**: load of bed, wet substrate and frame within what the roof carries
  (check with the building's data before building); the frame is ballasted or
  fixed, never only clamped; nothing can blow off.
- **Software**: watchdog between the Pi and the motion board; a lost
  heartbeat stops motion.

## 6. Never leaves the edge

Raw camera frames beyond the cell photos the owner chose to upload, anything
the camera sees outside the bed, calibration, Wi-Fi details. Photos are
cropped to the bed before upload. (To be added to `docs/privacy-contract.md`
when the edge is generated.)

## 7. Steps

1. **Done (twin):** a Webots twin, the gantry over a bed generated from the
   habitat, running `bed_actions` on ROS 2, in the `permtek5-twin-edge`
   repository (ADR 0018). Its self-test sows, waters, probes and
   photographs cells of CityDemo end to end.
2. **Done locally, not yet against the cloud:** the edge proposes jobs, a
   person confirms them on its page, and a sown cell is written into the
   area's A-Box. Still to do: pair it with stage, sync a real habitat, and
   see the sown cell on the PermTek-5 map.
3. Hardware: frame and axes, homing and limits, e-stop. Then the watering
   nozzle (the most useful tool), then the probe, the camera, the seeder.
   The real driver offers the topics the twin's driver offers.
4. First season on the real bed, with every job confirmed by hand before any
   standing rule.

## Open questions

- Motion board: ros2_control with a custom hardware interface, or GRBL-class
  firmware behind a driver?
- Seeds: one tray per crop, or a seed changer?
- Do standing rules live in the A-Box (visible in the app) or only on the edge?
- Photos: the template's object routes, or a route of their own with a size cap?
