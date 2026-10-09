# ADR 0007 — The twin runs on ROS 2, with scenario files and a fleet edge

Status: **Accepted** · 2026-10-07

## Context

The build plan wants "same controllers in the twin and the garden", what-if
runs and replays of real data. Today's twin cannot deliver that:

- `explorer.py` calls the Webots API directly (`Robot`, `getDevice`, `step`),
  so the mission logic can never run on a real rover.
- The scenario is fixed inside the garden supervisor (autan, rain at hour 36,
  the boar moving anchor 3 at hour 10). A what-if means editing code.
- There is no way to watch or steer a running fleet except the Webots window.

Webots has no scenario framework for this. It has the supervisor API (move
objects, change fields, reset), web streaming of the 3D view, and HTML robot
windows. Its traffic tooling (SUMO) is for roads. ROS 2 Kilted and
`webots_ros2` (2025.0.1) are installed on the workstation, and
`dhc-digital-twin-demo` already uses the same bridge.

## Decision

1. **Rovers on ROS 2.** Each rover is split in two:
   - a **Webots driver plugin** (`webots_ros2_driver`) that only turns the
     simulated wheels and sensors into topics;
   - a **mission node** (rclpy) with the logic of today's explorer. On a real
     rover the same node runs, with a hardware driver behind the same topics.

   The decision logic moves into a plain-Python core, tested without Webots
   or ROS.
2. **Stigmergy stays the only channel between rovers.** ROS connects a rover
   to its own driver and to the field: GNSS status, UWB ranges, soil probe,
   IR posts, and the nest's store. Every rover lives in its own namespace
   (`/rover1/…`). A launch test fails if a rover node subscribes to, or calls,
   anything under another rover's namespace. Without this, the test bed would
   silently turn into a message-passing fleet.
3. **The field stays in the field.** IR posts remain plain Webots controllers:
   real posts are microcontrollers, not ROS nodes. In the twin, the nest's
   store stays the file store that `stig_common.Store.sync()` reads; later
   the nest edge provides it.
4. **Scenarios are files** (`scenarios/*.yaml`): site file, fleet size and
   start poses, a weather and event timeline, run length, and pass criteria.
   The garden supervisor reads them and offers ROS services to load a
   scenario, set the time scale, inject an event and reset. A batch runner
   runs a list of scenarios headless and keeps each `report.py` summary.
5. **The fleet console is a robot edge.** It is generated from
   template-dlab5-edge with `edge_kind=robot` as **permaculture-fleet-edge**.
   Its ROS 2 bridge turns topics and services into MCP tools: reading is
   free, and publishing or calling a service is a proposal a person
   confirms. Its page starts scenarios, shows rovers, posts and traces,
   embeds the Webots stream and injects events. It links to the cloud's
   sandbox site with the device flow. Pointed at the real rovers, it is the
   same app. It is the first instance of the robot edge kind in the
   blueprint.
6. **Order**, each step gated on the previous one's numbers:
   1. ROS 2 rover;
   2. scenarios and supervisor services;
   3. fleet edge;
   4. web 3D view.

   Step 1 is planned in `docs/plans/twin-step-1-ros2-rover.md`.

   *Amended 2026-10-07* after the workflow (`docs/workflow.md`): a new step 2,
   **frame and explore**, comes before scenarios. It adds the geofence and
   no-go areas to the site file, a contour-first planner that stays inside
   them, and the explore mission (coverage by stigmergy). Scenarios, fleet
   edge and web view become steps 3–5.

## Consequences

- A colcon build and a launch file instead of "open the world, press play".
  The plain Webots path is kept until step 1 passes its parity gate, then
  removed, so there is one code path.
- The mission node runs outside Webots. Free-running, its commands lagged
  2–3 steps in fast mode. **Decided in step 1: lockstep** — the rover driver
  waits for the command computed from the step's sensors and applies it in
  the same step (about 30 % slower than the plain controller). This should
  make seeded ROS runs reproducible, which scenario batches need; run-to-run
  reproducibility on the ROS path is still to be checked in step 2.
- Everything stays in the public `permaculture-twin` (GPL-3.0-or-later).
  ADR 0006 and `check-public.sh` apply to the ROS package, scenarios and launch
  files: local metres, no site data.
- Real-rover drivers, Nav2 and the nest's store service are out of scope until
  hardware exists.
