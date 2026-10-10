# ADR 0018 — The gantry's twin is an edge of its own, with Blender meshes built offline

Status: **Accepted** · 2026-10-10 · Builds on [ADR 0017](0017-roofbed-gantry-is-a-robot-edge.md), [ADR 0014](0014-twin-on-ros2-scenarios-fleet-edge.md)

## Context

ADR 0017 wants a Webots twin of the roof-bed gantry before any hardware, and
a robot edge that works from the habitat's A-Box. ADR 0014 planned a "fleet
edge" to watch and steer simulated robots. Building them as one local app
gives the whole loop early: the habitat from the cloud becomes a world, the
gantry works its cells, a person confirms each job and watches the robot's
cameras, and what was sown goes back to the map.

Webots' own shapes are enough for motion but poor for plants, soil and
trees. Blender's Python module (`bpy`) can generate those. It is published
for a single Python version (3.13 today), while ROS 2 Kilted needs the
system's 3.12.

## Decision

1. **A separate repository, `permtek5-twin-edge`** (GPL-3.0-or-later),
   generated from `python-tool-template` and `template-dlab5-edge` with
   `edge_kind=robot`. It is the fleet edge of ADR 0014 for the gantry; rovers
   can join the same shell later.
2. **The world is generated from the habitat**, never drawn by hand:
   - one bed and its gantry;
   - the bed frame is the world frame, so a slider joint's position is the
     bed coordinate of `sowingJob()`;
   - the garden's plants stand behind the roof as scenery;
   - nothing is downloaded.
3. **ROS 2 holds the robot**:
   - a Webots driver plugin (axes, a tool camera, an overview camera, the
     bed's state);
   - `bed_actions` with the actions of the spec (`plant_cell`, `water_cells`,
     `probe_cells`, `photo_pass`): one job at a time, the tool lifted before
     every move, soft limits equal to the bed, an e-stop;
   - `bed_actions` talks to the gantry only through the driver's topics, so
     it can drive real axes later.
4. **The app's Python stays free of ROS.** A small gateway node on the ROS
   side serves state, camera pictures and jobs on 127.0.0.1; the app starts
   the launch as a child process and passes the gateway through to its page.
   (The tool template strips ROS from the app's environment on purpose: its
   packages and ROS's would shadow each other.)
5. **`bpy` is an offline asset step in its own interpreter.**
   - `scripts/setup-bpy.sh` creates `.venv-bpy` (Python 3.13).
   - `assets/build.py` writes plain OBJ files into the workspace.
   - Neither the app nor the simulation imports `bpy`. Without the meshes the
     world uses boxes and spheres and behaves the same.
   - Collisions never use meshes.
6. **Proposals, then Confirm.** The page lists what the gantry could do
   (sow planned cells, water dry ones, probe and photograph what is planted).
   A job is sent only by a person's Confirm, or in the chat as a proposal.
   Whether it is the right month stays the cloud calendar's question.
7. **What was sown is written back** into the area's A-Box (cell status and
   date), checked with the cloud's shapes and carried by the edge layer's
   sync; never for the invented CityDemo.

## Consequences

- Two processes and two Pythons on the workstation (three with the mesh
  builder), in exchange for no dependency clashes and a ROS side that does
  not know about the web app.
- The simulation needs a source checkout with the ROS workspace built; a
  pip install of the edge alone gives the page and the cloud link, and says
  what is missing.
- The bed's moisture is a simple number per cell, and seedlings appear at
  once: the twin tests the loop and the motion, not horticulture.
- A real habitat synced to the edge, its worlds, pictures and logs stay in
  the edge's git-ignored workspace (ADR 0013 applies to the edge repository
  too).
- Open: pairing with the live cloud and the first sync of a real habitat
  have not been tried yet; they need the habitat PRs deployed and a site
  admin's approval on `/link`.
