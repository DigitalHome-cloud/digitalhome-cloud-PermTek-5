# Twin step 1 — the rover on ROS 2

Part of ADR 0014. Status: **work items 1–7 done; item 8 (switch-over) waits on the coverage criteria, see Results** · 2026-10-07

## Goal

The same mission logic as today's `controllers/explorer/explorer.py`, running
as a ROS 2 node against a Webots driver plugin, with **the same results** on
the demo site. Nothing new for the user yet; this is the base for scenarios
(step 2) and the fleet edge (step 3).

## Today (what has to be split)

`explorer.py` (~470 lines) mixes three things:

| Part | Lines today | Goes to |
|---|---|---|
| Devices: 4 wheels + encoders, GPS (mast 0.95 m), IMU, 3 front + 2 drop distance sensors, camera, IR emitter/receiver, radio | `dev(...)`, `set_speed`, `read_ir`, `rx_bytes` | **driver plugin** |
| Field emulation received over radio from the supervisor: RTK fix/float, UWB ranges, soil reading | `sense()` radio part | **garden driver** publishes them as sensors |
| Mission: Localizer (odometry + lever arm + UWB/GNSS fusion), anchor suspicion, planner, claims, state machine DOCKED → … → DOCKING, store writes | the rest | **mission core** (plain Python) + **mission node** (rclpy) |

The supervisor also receives each rover's pose over radio, to log the
position error against ground truth.

## Target layout (inside `twin/`, public, GPL)

```
twin/
  stigmergy/                     plain Python, no Webots, no ROS (unit-tested)
    common.py                    = today's controllers/stig_common.py (moved)
    mission.py                   Localizer + Mission: inputs (time, encoders, imu, gnss, uwb,
                                 ranges, ir frames, soil) -> outputs (wheel speeds, ir_tx, store writes, log)
  ros2/permaculture_twin/        ament_python package
    permaculture_twin/
      rover_driver.py            webots_ros2 Python plugin: devices <-> topics
      garden_driver.py           supervisor plugin: weather, events, per-rover RTK/UWB/soil, truth log
      explorer_node.py           rclpy node wrapping stigmergy.mission
    resource/rover.urdf          <webots><plugin type="permaculture_twin.rover_driver.RoverDriver"/></webots>
    resource/garden.urdf
    launch/twin.launch.py        site:=  rovers:=2  mode:=fast|realtime  gui:=false
    test/test_isolation.py       launch test: no rover touches another rover's namespace
    test/test_mission_core.py    plain unit tests of stigmergy/
  controllers/                   legacy path, kept until the parity gate passes, then removed
```

`tools/generate_world.py --ros` writes `controller "<extern>"` for the rovers
and the supervisor; without `--ros` the world is as today.

## Topics (per rover, namespace `/roverN`)

Named after the **real** sensors, so a hardware driver can publish the same:

| Topic | Type | Direction | Source in sim |
|---|---|---|---|
| `cmd_wheels` | `std_msgs/Float64MultiArray` [left, right] rad/s | node → driver | wheels |
| `wheel_encoders` | `sensor_msgs/JointState` (fl, fr, rl, rr) | driver → node | PositionSensors |
| `imu` | `sensor_msgs/Imu` | driver → node | InertialUnit |
| `gnss/position` | `geometry_msgs/PointStamped` (local ENU, antenna) | driver → node | GPS |
| `gnss/status` | `std_msgs/String` fix / float | garden → node | canopy check |
| `uwb/ranges` | `std_msgs/String` JSON [[anchor, m], …] (own msg later) | garden → node | anchors |
| `soil` | `std_msgs/Float32` % | garden → node | soil model |
| `range/<name>` | `sensor_msgs/Range` | driver → node | DistanceSensors |
| `ir/rx`, `ir/tx` | `std_msgs/UInt8MultiArray` (IR frame bytes) | driver ↔ node | IR receiver/emitter |
| `pose` | `geometry_msgs/PoseWithCovarianceStamped` | node → garden | for the truth log only |
| `/clock` | sim time | Webots → all | `use_sim_time:=true` |

Camera stays off in step 1 (it is only enabled today, never read).

**Isolation rule** (ADR 0014): a rover's nodes may use only `/roverN/*`,
`/clock`, `/rosout`, `/parameter_events`. Rovers do not talk to each other;
they meet only in the store (`data/store_*.jsonl`, read at docking) and on
the IR posts.

## Work, in order

1. **Mission core, still on plain Webots.** Move `stig_common.py` to
   `stigmergy/common.py`. Extract `Localizer` and the state machine from
   `explorer.py` into `stigmergy/mission.py`, behind a `step(inputs) ->
   outputs` interface. The legacy controller becomes a thin adapter.
   **Check:** the 100-hour demo run matches the baseline (gate below) before
   any ROS work starts. This separates "refactor broke it" from "ROS broke it".
2. **Unit tests** for `stigmergy/` (decay, UWB with the outlier, lever arm,
   planner passages, claims with a lease). Run with `pytest` without Webots.
3. **Driver plugins.** `rover_driver.py` uses the device names from
   `ExplorerRover.proto`. `garden_driver.py` is today's supervisor with
   publishers in place of `radio_tx` and subscribers in place of `radio_rx`.
4. **Mission node**: a timer at the basic time step (32 ms sim time). It
   collects the latest messages, calls `mission.step`, and publishes
   `cmd_wheels`, `ir/tx` and `pose`.
5. **Launch**: `WebotsLauncher` (world from `--ros`), one `WebotsController`
   per rover and one for the garden, and one `explorer_node` per rover in its
   namespace. Parameters are site, rovers, mode and gui.
6. **Lag measurement.** Log the age of the newest `cmd_wheels` at each driver
   step. In fast mode, if the median is above 2 steps, pick one fix and record
   it in the ADR: either run at a capped real-time factor, or add a lockstep
   (the driver waits for the command stamped for this step).
7. **Isolation test** (`launch_testing`): start 2 rovers and read the graph.
   Fail if any node in `/roverN` publishes, subscribes to or calls under
   `/roverM`.
8. **Switch over**: README and CLAUDE.md say `ros2 launch permaculture_twin
   twin.launch.py`, and `controllers/explorer` and `controllers/garden_supervisor`
   are removed. `controllers/ir_post` stays.

## Gate (parity with today's controller, demo site, 100 garden hours, headless)

Baseline from the plain controller on the demo site (2026-10-07, 174 h):
all 6 posts visited at least twice; 7 dockings with mean correction 0.027 m;
position error mean 0.030 / 0.026 m, 95th percentile 0.063 / 0.055 m; anchor 3
flagged after the boar.

The ROS run passes if, over 100 garden hours:
- every post is visited at least twice and no claim is released twice in a row;
- every docking succeeds (mean correction ≤ 0.05 m);
- position error mean ≤ 0.04 m and 95th percentile ≤ 0.08 m per rover;
- anchor 3 is flagged as suspect after the boar event;
- the isolation test passes;
- `scripts/check-public.sh` passes.

Rerun the baseline in the same session before comparing: one run is noisy.

## Out of scope

Scenario files and supervisor services (step 2), the fleet edge (step 3), the
Webots web stream (step 4), Nav2, real hardware drivers, the camera, a custom
message package (JSON-in-String for UWB until step 2 needs better).

## Risks

- **Timing**: the node is outside Webots' step. See work item 6. This is the
  one real unknown.
- **Behaviour drift during the extraction**: guarded by doing step 1 on the
  plain Webots path first and checking the gate.
- **Workstation**: the Quadro K2100M (driver 470) is fine headless. GUI runs
  are slow but not needed for the gate.

## Results (2026-10-07)

| Item | Result |
|---|---|
| 1 Mission core on plain Webots | `stigmergy/mission.py`, `stigmergy/garden.py`; controllers are thin adapters. Old vs new with `PYTHONHASHSEED=0`: truth log byte-identical for 58 garden hours, stores identical |
| 2 Unit tests | `tests/test_stigmergy.py`, 17 pass without Webots or ROS |
| 3 Driver plugins | `rover_driver.py`, `garden_driver.py`; the driver's automatic device topics are switched off in `rover.urdf` (they included the radio, a channel between rovers) |
| 4 Mission node | `explorer_node.py`, one step per encoder message |
| 5 Launch | `twin.launch.py` starts Webots directly (WebotsLauncher copies the world to /tmp, where the IR posts' controller is not found) |
| 6 Lag | free-running: median 2–3 steps. **Decision: lockstep.** The driver publishes a step's sensors, waits for the command computed from them and applies it in the same step; before the first step it waits for the mission node. Field readings carry their sim time and are applied one step later, like the plain radio. Speed: ~8 garden h per wall minute (plain: ~11.6) |
| 7 Isolation | `tools/check_isolation.py` + launch test `test/test_isolation.py`: pass; a probe publishing from /rover1 into /rover2 is caught |

**Parity, exact.** With `PERMA_TRACE` set, the mission writes every step's inputs and outputs. Plain vs ROS, same seed: inputs identical (distance sensors within float32 rounding) for 247 steps, outputs identical for 1550 steps (49.6 s). The first difference is Webots physics itself: with identical commands, rover attitude differs by ~1e-5 rad when the rovers run as `<extern>` controllers. From there the runs drift apart chaotically, like any two runs on this slope.

**Gate, statistical (100+ garden hours, unseeded):**

| Criterion | Plain, 108 h | ROS, 118 h |
|---|---|---|
| position error mean ≤ 0.04 m, 95th ≤ 0.08 m | 0.030 / 0.026, 0.062 / 0.052 ✓ | 0.028 / 0.029, 0.059 / 0.061 ✓ |
| anchor 3 flagged after the boar | h 28.4 ✓ | h 21.0 ✓ |
| docking corrections ≤ 0.05 m | 0.032 ✓ | 0.027 ✓ |
| every post visited at least twice | ✗ (post 2 once) | ✗ (rover2 trapped from h 21) |
| isolation test, check-public | — | ✓ |

The coverage criterion fails **on both paths**: a rover returning from zone 4's east tip
is driven into the fence by the straight-line planner (twin open issues 3 and 4). The
174-hour baseline passed it by luck of the seed. This is a planner bug, not a ROS one.

**Next:** twin step 2, *frame and explore* (`docs/workflow.md`, ADR 0014 amended): geofence
and no-go areas in the site file, a contour-first planner inside them (fixes the fence
trap), the explore mission. Then rerun the coverage criterion on the ROS path and do item 8
(switch-over, remove the plain explorer and supervisor).
