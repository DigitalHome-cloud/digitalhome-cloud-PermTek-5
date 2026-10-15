# ADR 0028: A guided WormBed5 map

Status: **Accepted** · 2026-10-15 · Amends [ADR 0027](0027-plant-sets-and-surface-categories.md) · Builds on [ADR 0020](0020-perma5guild-one-edge-per-guild.md)

## Context

Testing the Map after ADR 0027 showed it was hard to use:

- **It did not start from a blank sheet.**
  - An empty map offered four kinds of area and an example with a "Flat roof" and a "Back garden".
  - Each area then offered a guild, a plain bed, a farm of plain beds, and trees.
  - Nothing said where to begin.
- **Sizes were free numbers.**
  - A bed could be any length and width.
  - The worm box could be any length, though `wormbed5-sizing.md` says what it should be.
- **A plant set was only a name and a list of crops.** Nothing said why those crops go together, or why the planner
  placed them as it did.
- **A farm planted every bed differently.** The sets were always shared out over the beds.

The owner asked:
- to get the WormBed5 right before any other use;
- to start by choosing the use: one WormBed5, or a farm of them;
- to let a farm plant its beds with the same sets or with different ones;
- for an explanation page for every plant set;
- for a guided worm box.

## Decision

### 1. The map starts empty, and only the WormBed5 is offered

An empty map shows "How the map works" in five steps, and the new-WormBed5 steps:

| Step | What is asked |
|---|---|
| 1. What | One WormBed5, or a farm of WormBed5 |
| 2. Where | An existing area, or a new one: roof, balcony or terrace, or garden; its sun and wind |
| 3. Size | Length 200–400 cm, width 80/100/120 cm, depth 15/25/35 cm, tank pipes yes or no. A farm adds rows, beds per row and the path |
| 4. Worm box | The household's size; the box is sized from it |

- **Before creating,** it shows the summary and the wet weight. On a roof or balcony it also says whether the load is
  light, terrace-like or heavy.
- **Areas may not be added on their own any more.** The same goes for plain beds, farms of plain beds, trees and
  greenhouses. The CityDemo example is no longer offered.
- **What a map already holds still shows,** so nothing is hidden. Plain beds can still be made a WormBed5.
- **The ontology drops `GreenhouseSurface` and `FoodForestSurface`.** Nothing used them, and they come back with their
  own planner.

### 2. Guided sizes (`packages/core/src/wormbed5.ts`)

- **`WORMBED5_SIZES`:** the sizes offered. Cells are 10 cm, the gantry's grid.
- **What each depth grows,** from `roofbed-system.md` §2: 15 cm grows salads, 25 cm adds chard and basil, 35 cm adds
  tomatoes, courgettes and peppers.
  - `minDepthCm(crop)` uses that table first, else the crop's root depth (shallow 15, medium 25, deep 35).
  - The plant-set picker warns about crops that want more substrate than the bed has.
- **A WormBed5's bed card** offers the same choices instead of free numbers. A size set earlier that is not on the
  list stays choosable.

### 3. The worm box is sized by the household

The numbers come from `wormbed5-sizing.md`:
- 0.48 m² turns over about 90 kg of scraps a year (H1);
- a person gives about 35 kg of suitable scraps a year (H6);
- so a person needs about 0.19 m² of box.

`wormBoxCm(people, width, length)` gives the box's length, rounded up to 10 cm:
- **At least 30 cm,** because a smaller box loses its warmth.
- **At most a quarter of the bed's length.**

The choice is "kitchen scraps from 1, 2, 3 … people". The list ends at the first household that gets the largest box.

`wormBoxYear(bed)` says what the box does in a year:
- the scraps it takes;
- the castings it gives;
- what the bed itself uses (1.6 kg/m², the spec's way B).

The rest of the castings goes to other plants.

### 4. A farm of WormBed5

**Each bed is its own WormBed5 guild,** with its own worm box and robot (one edge per guild, ADR 0020).
`newWormBedFarm()` makes the farm, its beds and their guilds.
- Opening a bed of the farm shows its guild: the bed, the worm box and the water.
- The farm's beds keep the farm's length and width.
- Removing the farm removes its guilds, with their water and learning cycles.

**Planting a farm** has two modes:

| Mode | What it does |
|---|---|
| The same sets in every bed (default) | `planFarm(…, { same: true })` |
| Share the sets out over the beds | ADR 0027's `shareOut` |

Each bed can still be planned on its own from its card. `/edge/v1/plan` and the edge's `plan_bed` take `same` too.

### 5. Every plant set explains itself

- **`perma:rationale`** (multilingual) says why a set's crops go together and what to watch. `rdfs:comment` gives its
  one-line summary, now in EN, DE and FR.
- **The library's six sets** have both in three languages. A test keeps it so.
- **The site's page `/sets/`** has one section per set:
  - its summary and reasons;
  - its plants, with each one's share of the room, layer, spacing, height and the substrate it wants;
  - its good neighbours, bad neighbours and relatives within the set;
  - an example layout made by the planner on a 300 × 100 cm WormBed5 deep enough for every member.

  A section at the top explains how a set becomes a bed.
- **Links from the Map:**
  - each library set has a "Why these plants?" link;
  - a plan has a "How the layout is made" link.
- **A space's own set** shows its reasons inline.
- **The texts are traditional companion-planting guidance,** and the page says so.

## Consequences

- **A new person meets one path:** what, where, how big, the worm box, then planting.
- **The worm box follows the sizing spec.** When the spec's Act step changes the numbers, `WORM_BOX` changes with
  it.
- **A farm of WormBed5 has as many guilds as beds.** Learn lists each, and each would run its own edge.
  - If a farm is later meant to share one robot or one worm box, that is a new guild type, not a change here.
  - Farms of plain beds made under ADR 0027 still show and plan.
- **Open:**
  - areas, greenhouses, trees and food forests come back one at a time once the WormBed5 is right;
  - a farm's size cannot be changed after it is made (remove it and make it again);
  - the page's layouts are examples, not the plan for a person's own bed.
