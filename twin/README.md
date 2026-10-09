# permaculture-twin

A Webots R2025a test bed for a permaculture garden on a steep hillside: an
anchor web for positioning, writable IR marker posts, a charging nest and two
observe-only explorer rovers that coordinate **only through traces**: claims
and observations in a shared store (synced at the nest) and state written on
the IR posts (stigmergy).

The world is **generated from a site file**. `sites/` is a library of
invented sites for study and research ([sites/README.md](sites/README.md));
the reference is **PermaDemo**, a 25 % hillside with four zones, fascines, a
vegetation map, no-go areas and hidden objects. Real sites are not published
here: see [Real sites](#real-sites).

Part of PermTek-5 (DigitalHome.Cloud, D-LAB-5): the same site model will
feed the cloud, the garden's nest and this twin.

## Run

```bash
pip install shapely pillow
python3 tools/generate_world.py                    # PermaDemo -> worlds/site.wbt, site_config.json
python3 tools/generate_world.py --site <name>      # another site under sites/
webots worlds/site.wbt                             # press play; fast mode for long runs
python3 tools/report.py                            # after a run: traces, visits, docking, position error
```

Headless: `webots --batch --mode=fast --no-rendering --stdout --stderr worlds/site.wbt`

### On ROS 2 (Kilted, webots_ros2)

```bash
source /opt/ros/kilted/setup.bash
(cd ros2 && colcon build --symlink-install) && source ros2/install/setup.bash
python3 tools/generate_world.py --ros                     # worlds/site_ros.wbt: rovers and garden as <extern>
ros2 launch permaculture_twin twin.launch.py              # mode:=fast|realtime gui:=true|false
python3 tools/check_isolation.py rover1 rover2            # while it runs: no rover talks to another
```

Each rover is a driver plugin (devices ↔ topics under `/roverN`) plus a mission
node; the mission itself is `stigmergy/mission.py`, the same code as the plain
controller. Driver and node run in lockstep. `PERMA_TRACE=<folder>` makes the
mission write every step's inputs and outputs, to compare two runs exactly.

Time: 1 simulated second = 2 garden minutes (`time_scale` in the site file).
Follow a rover: select it in the scene tree, *View → Follow Object*.

## The site file

Local metres only (x east, y north), no geographic coordinates:

| Key | What |
|---|---|
| `terrain.high`, `terrain.low`, `terrain.bbox` | the slope is a plane through two points; the modelled area |
| `garden.a`, `garden.b`, `garden.axis`, `garden.zone_areas_m2` | outlines; zones 1/2/3 are cut from A along the axis by area, B is zone 4 |
| `pond`, `pool`, `oaks`, `orchard` | features; fascines and their fruit trees are derived in zone 2 |
| `posts`, `anchors` | where IR posts and UWB anchors go (next to a tree, a fascine, or a zone edge) |
| `frame.geofence`, `frame.no_go` | where rovers may drive (default: the garden outline); no-go circles or polygons |
| `unknown` | hidden objects: in the world, not in the rovers' map, for exploration to find |
| `vegetation` | the vegetation map: trees, shrubs (circles), patches of meadow, tall grass, hedge, bramble, crop, bare soil (polygons); classes from the ontology, behaviour in `stigmergy/vegetation.py` |
| `explore_first`, `cell_m` | explore by coverage cells before the post routine |
| `z_offset`, `ground_image` | real elevation and a site plan as ground texture: **private sites only** |

Everything the generator writes (`worlds/`, `site_config.json`) and run output
(`data/`) is ignored by git.

## Real sites

GPL covers this code; a site file is input data, not part of the program.
Keep a real site's file, plan and outputs in a private repository and pass it:

```bash
python3 tools/generate_world.py --site ../my-private-site/site.json
```

Before every commit run `scripts/check-public.sh`. It refuses plans, generated
worlds, run data, geographic keys, a non-zero `z_offset` or a `ground_image` in
`sites/`, and any term in your private denylist
(`~/.config/permaculture/denylist`, one regex per line; never commit it).

## Code map

```
stigmergy/common.py               simulator-free logic: IR frame, half-life decay, UWB solver with
                                  leave-one-out outlier, path planner, trace store, soil model
stigmergy/mission.py              rover mission: DOCKED → plan → UNDOCK → GOTO → INSPECT → … → RETURN → ALIGN → DOCKING
stigmergy/nav.py                  the frame as a grid; contour-first A* planner
stigmergy/garden.py               "the garden": soil, wind, rain, sun vs IR range, RTK float under oaks,
                                  UWB ranges, a boar that moves an anchor, ground truth
controllers/                      plain Webots adapters (explorer, garden_supervisor) and the IR post
ros2/permaculture_twin/           ROS 2 package: rover and garden driver plugins, mission node, launch, isolation test
tests/                            pytest, no Webots or ROS needed
protos/                           ExplorerRover, IrPost
tools/generate_world.py           site file -> world, ground texture, site_config.json
tools/report.py                   run summary
tools/check_isolation.py          ROS graph check: each rover only in its own namespace
scripts/check-public.sh           leak guard
```

Developer notes and lessons learned: [CLAUDE.md](CLAUDE.md).

## Licence

**GPL-3.0-or-later** ([LICENSE](LICENSE), [COPYRIGHT](COPYRIGHT)). The sites under `sites/`
are invented and CC0.
