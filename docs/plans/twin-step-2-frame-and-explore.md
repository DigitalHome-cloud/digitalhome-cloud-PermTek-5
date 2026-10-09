# Twin step 2 — frame and explore

Part of ADR 0007 (amended) and `docs/workflow.md` stages 2 and 4. Status: **items 1–6 built; gate not met — rovers leave the frame at downhill edges, see Results** · 2026-10-07

## Goal

Rovers move only inside a frame people drew. On a new site they first **explore** it
by coverage, then switch to the post routine. The fence trap of step 1 goes away
because the planner works inside the frame instead of drawing straight lines.

## Work, in order

1. **Frame in the site file.** `frame.geofence` (default: the garden outline) and
   `frame.no_go` (circles or polygons with a label: pond edge, bat roost, steep
   bank). The generator writes them into `site_config.json` and builds a navigation
   grid from them. **Reachability check**: every post stand point and the dock
   approach must be reachable from the nest inside the frame, or the generator
   stops and says which.
2. **Contour-first planner** (`stigmergy/nav.py`): A* on a 0.5 m grid of the frame,
   minus no-go areas and known obstacles (inflated by the rover's half-width plus a
   margin), with fascines as walls except at their passages. Move cost favours
   contours and the fall line and penalises diagonals on steep ground (lesson: never
   diagonally on a 44 % slope). The path is simplified to waypoints with line of
   sight. It replaces `common.plan_path` in the mission.
3. **Frame watch** in the garden: ground truth logs every moment a rover's true
   position is outside the geofence or inside a no-go area. The report prints it.
   The gate allows none.
4. **Hidden objects** in the site file (`unknown`): rocks, a fallen branch, a wet
   spot. They are placed in the world but **not** in the rover's map, so exploration
   has something real to find.
5. **Explore mission** (`stigmergy/mission.py`, mode `explore`): the frame is cut
   into coverage cells (about 4 m). A rover picks the cells whose "covered" traces
   have decayed most, claims a few with a lease (as with posts), drives to each, pauses
   to scan and writes `covered`. When the front sensors meet something the map does
   not know, it writes a **finding** (Suggested) at the estimated position. When every
   cell has been covered once, the store says so and the rovers switch to the post
   routine. Two rovers share the work only through the store.
6. **Report**: coverage over time, findings vs hidden objects, frame violations.
7. **Runs**: plain path first (faster), then ROS. Then item 8 of step 1 (switch-over).

## Gate (demo site, headless)

- **No frame violation** in any run (true position never outside the geofence or in a no-go area).
- **Coverage complete** within 48 garden hours with two rovers.
- **Findings**: every hidden object is reported within 1 m of where it is.
- **Post routine** after exploration: over 100 garden hours, every post visited at least
  twice, every docking succeeds; position error as in step 1.
- Isolation test and `check-public.sh` pass; `pytest tests` passes.

## Out of scope

The owner's review of findings (cloud, phase 4), real terrain, a better soil or
vegetation model, camera-based detection.

## Results so far (2026-10-07, plain path, demo site)

Built:

- **Frame**: `frame.geofence` / `frame.no_go` in the site file, written to `site_config.json`;
  `stigmergy/nav.py` grid. Edge margins depend on the slope: 1.2 m where the ground falls away
  outside the edge, 0.8 m where it rises. The generator stops if a post, a stand point or a
  dock approach is not reachable inside the frame (demo and the private site pass).
- **Planner**: A* on 0.5 m cells, cost favours contours and the fall line, long legs never
  diagonal on steep ground; replaces the straight-line planner. The trip that trapped rover2 in
  step 1 (zone 4's east tip to the nest) now goes round through the passage between zones.
- **Frame watch**: the garden logs every sample of a rover's true position outside the frame.
- **Hidden objects** (`unknown`) in the world but not in the map; `worlds/truth.json` for the report.
- **Explore mission**: coverage cells (4 m) claimed with a lease and covered by stigmergy;
  sightings, and **findings** only after two sightings at the same place ≥ 0.5 h apart (a moving
  rover is never seen twice in one place; at the first try rover2 parked in its dock became a
  "finding" and blocked the nest); then the switch to the post routine.
- Turns are forward arcs with the inner wheel never reversing (no pivots in GOTO/RETURN).
- `pytest tests`: 23 pass.

Latest run (152 garden h): 12 dockings, position error 0.024 m mean; 75 of 110 cells covered;
2 of 4 hidden objects seen within 0.71 m, 1 confirmed; **rovers outside the frame for many hours
along zone A's downhill edge**, and most false findings line that edge (the fence).

| Iteration | Cause found | Change |
|---|---|---|
| 1 | a docked rover became a finding | two sightings ≥ 0.5 h apart; nothing near the docks |
| 2 | 0.55 m margin too small on the slope | 1.2 m downhill, 0.8 m uphill; frame-safe sidestep |
| 3 | overshoot at a cell, pivot back, slide 2 m | cells reached within 1 m |
| 4 | "go back in" looped near the nest | recovery only when outside the frame margin |
| 5 | pivot after a scan slid 2.4 m downhill | forward-arc turns, inner wheel ≥ 0 |
| 6 | still leaving at the downhill edge | **open** |

**Open problem.** On a 44 % slope this rover model does not hold its line near a downhill edge
well enough: turning and stopping make it slip downhill, and the post routine of step 1 never
asked it to go there. That is the slope-limits question (wheels vs tracks, friction on wet clay)
from the twin's next steps, now with a concrete test case. Not yet run: the ROS path with the
step 2 mission.

## Update (2026-10-08): two sites, vegetation

Decided with the owner: **PermaDemo** (public, invented, ~25 %) validates the logic of
frame, explore, vegetation and post routine; **the first real site** (private, 44 %) carries the
hardware question with a slope test bench (wheels vs tracks). The gate of this step is
measured on PermaDemo. `twin/sites/` is a library: more virtual sites for study can be
added without code.

Vegetation map added to the site file (classes from `ontology/`), used by the twin for
drive cost and blocked areas, canopy (RTK float, soil shade) and the world. The real site's
layer is traced from the plan's aerial photo, all *to confirm* on the owner's walk.
