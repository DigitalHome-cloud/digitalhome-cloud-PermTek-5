# CLAUDE.md — permaculture-twin

Webots R2025a test bed for observe-only garden robots that coordinate by
stigmergy. **This repository is public (GPL-3.0-or-later). It must never
contain anything that locates a real site.** Answer in English unless the
owner switches; simple solutions, plain words, no marketing tone.

## Public code, private site

- The world is generated from a site file: `python3 tools/generate_world.py [--site path]`.
  Default is PermaDemo (`sites/permademo/`); `sites/` is a library of invented sites
  for study and research (`--site <name>`). Add one by copying a folder.
- Real site files, plans, generated worlds and run data live in a private
  repository and are passed with `--site`. Never copy them in here, never
  quote their names, elevations or outlines in code, comments, commits or docs.
- Run `scripts/check-public.sh` before every commit (it is also the pre-commit
  hook). It uses a private denylist at `~/.config/permaculture/denylist`.
- **Never hand-edit** `worlds/*.wbt` or `site_config.json`: change the
  generator or the site file and rerun. Both are git-ignored outputs.

## Run

- Open `worlds/site.wbt` after generating, press play. Fast mode for long runs.
- Headless: `webots --batch --mode=fast --no-rendering --stdout --stderr worlds/site.wbt`
- After a run: `python3 tools/report.py`. `data/` is rewritten every run.
- 1 simulated second = 2 garden minutes (`time_scale`). Physics run at real speed.

## Two ways to run, one mission

The decisions live in `stigmergy/` (plain Python, tested by `pytest tests`).
`controllers/` adapts them to plain Webots; `ros2/permaculture_twin` adapts
them to ROS 2 (ADR 0014, step 1). Change behaviour in `stigmergy/`, never in
an adapter. Rovers must stay in their own ROS namespace: run
`tools/check_isolation.py` (or the launch test) after touching the ROS side.

## Stigmergy rules implemented

Claims with a 12 h lease; read-time decay (half-life per property, nothing
deleted); skip a post inspected < 45 min ago; no writing when position sigma
> 0.5 m; watering only *suggested* (soil < 12 %); a suspect anchor is excluded
and an Inspection suggested.

## Lessons already learned (do not undo)

1. **GNSS lever arm.** The antenna is 0.95 m up the mast; on 24° it leans ~0.4 m.
   The explorer subtracts it with IMU roll/pitch (error 0.3–0.45 m → ~3 cm).
2. **Odometry on slope** uses the horizontal part only (`d * cos(pitch)`).
3. **Docking is physical**: creep along the dock line until the front sensor
   touches the nest wall, then check the *fused* position and reset the pose.
4. **Dock along the contour.** Rovers never climb into the nest; they only roll sideways.
5. **No levelled pads where rovers drive.** Pads and terraces made embankments
   that trapped rovers. The nest is dug into the slope; its downhill wall reaches the ground.
6. **Turn gently on the slope.** Pivot turns slide the rover downhill. Arcs for
   heading errors 0.5–1.2 rad, pivot only above that.
7. Keep the world self-contained: Webots' online assets failed to load on the owner's machine.

## Open issues

1. Rovers can get wedged between a fascine and the fruit trees just uphill of
   it (`fascine_tree_offset_m`, default 0.8 m). Try ≥ 2 m and/or keep stand
   points out of the fascine–tree strip.
2. Occasional 0.5 m position spikes around garden hour 30: lever-arm sign at
   large roll, or UWB with the moved anchor before it is excluded.
3. The planner draws straight lines across a 44 % slope. Prefer contours, climb
   only at passages along the fall line.
4. Demo site: on the way home from zone 4's east tip, the straight-line
   planner drives into the fence (rover1 stuck from garden hour ~164 of 174).
   Narrowing zone 4 made it worse (51 stuck events in 110 h): fix the planner
   (issue 3), not the site.
5. Not modelled: wheel slip on wet clay, soil probe force, vegetation growth, IR collisions between posts.

## Next steps

1. **Frame**: geofence and no-go areas in the site file; the generator checks that
   every post and stand point is reachable from the nest inside them.
2. **Contour-first planner** inside the frame (open issues 3 and 4).
3. **Explore mission**: coverage cells with decaying "visited" traces, claims shared
   by stigmergy, findings written as Suggested. Comes before the post routine on a new site.
4. Rerun ≥ 100 garden hours on ROS; then remove the plain explorer and supervisor.
5. Fascine–tree strip (open issue 1); slope limits at 30/40/50 % with friction 0.4–0.5.
6. `--site` accepts the A-Box export of the permaculture cloud; store records mapped to perma-core.
