# ADR 0020 — The Perma5Guild: an area's working unit, one edge each

Status: **Accepted** · 2026-10-10 · Builds on [ADR 0016](0016-habitat-model-zones-beds-cells-trees.md), [ADR 0018](0018-twin-edge-for-the-gantry.md), [ADR 0019](0019-roofbed-wicking-bed-with-worm-box.md)

## Context

The first twin was built around "one bed in one app". Running it showed
what the repeatable thing really is: not a bed, and not a robot, but **an area
together with its bed, worm box, tank, sensors and robot(s)**. Sizes and
settings differ from place to place; the problem, the parts and the jobs are
the same. That unit needs a name and a place in the model, or every new roof
or garden corner becomes a one-off.

## Decision

1. **The unit is a Perma5Guild** (`perma:Guild`): an area's working unit of
   bed(s), worm box, tank, sensors and robot(s), kept and run together. The
   levels people see are Site → Area → Perma5Guild.
2. **A guild type fixes the structure; an instance sets the sizes.**
   - The type (`perma:guildType`) says which parts exist, which jobs can be
     done, which sensors are expected and which scenarios apply.
   - The instance carries dimensions and settings: the bed's size, depth and
     substrate, the tank pipes, the worm box's length, whether the worms may
     leave the box.
3. **The first type is WormBed5**: one flat bed with a worm box at one end,
   its liquid given to the plants from below, worked by a gantry
   (`docs/specs/roofbed-system.md`).
4. **A guild names its robot model** (`perma:robotModel`). The first is
   **Gantry5-gen1**: Gantry5, first generation. A redesign is gen2; the name
   of the robot stays (`docs/specs/roofbed-robot.md`).
5. **One edge runs one guild.** The same edge software is started once per
   guild, with that guild's own workspace, ports and link. Two guilds on one
   site are two edge instances, on one computer or on two.
6. **A bed without a guild stays valid**: a plain bed worked by hand. Maps
   saved before guilds existed load unchanged.
7. **The foundation every guild type shares** is in
   `docs/specs/perma5guild.md`: observations, the ladder of algorithms from
   rules to learned models, disturbances the guild must survive ("chaos
   monkeys"), and the policy for bare soil and weeds.

## Consequences

- A second guild type (a balcony trough, a tree row with a rover) adds a
  concept, its parts and its jobs; the edge shell, the keeper and the
  scenario runner are reused.
- "WormBed5 has exactly one bed" is checked in `packages/core`; the shapes
  only say what a guild is.
- The twin edge becomes guild-centric: it is started for one guild and shows
  that guild's type and robot.
- Whether worms should be able to leave the box is a setting, not a verdict:
  the twin simulates both, and a season on a real bed decides.
