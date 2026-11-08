# ADR 0027 — Plant sets, layers and surface categories

Status: **Accepted** · 2026-10-15 · Amended by [ADR 0028](0028-a-guided-wormbed5-map.md) · Builds on [ADR 0021](0021-recipes-drive-a-mixed-planting.md), [ADR 0016](0016-habitat-model-zones-beds-cells-trees.md), [ADR 0020](0020-perma5guild-one-edge-per-guild.md)

## Context

The map lets a person draw a bed and paint crops into its cells, and ADR 0021
suggests a mixed bed from recipes. Testing it showed what is still too
manual.

- **Planting by hand ignores spacing.** A click checked only the cell itself,
  so a plant could stand inside another's room.
- **People think in compositions, not single crops.** They want "kitchen
  herbs", "a salad bed", "tomatoes and their friends". The big plants should
  go in first, the little ones last. Some may overlap (a low herb under a
  tomato), others may not.
- **Surfaces differ.** A roof bed, a field of beds, a greenhouse and a food
  forest have different limits and need different planners.
- **The planner and the model belong in the cloud.** The edge's agent should
  be able to use them, as a second brain, without copying them.

The word "guild" is taken: in this app a guild is a Perma5Guild, the bed with
its worm box and robot. A composition of plants is a **plant set**.

### Open models and data

No open, ready-made optimiser plants a permaculture bed.

- **Planners that exist** are square-foot grid apps. They place plants and
  look up companions, but they do not search for a good arrangement.
- **Open plant data:**
  - Growstuff: about 370 crops, CC-BY-SA, so share-alike applies;
  - Open Plantbook: thresholds only;
  - OpenFarm's MIT data: archived.
- **Companion-pair datasets** exist, but their licences are unclear.
- **The general tool for larger surfaces** is a constraint solver.
  - OR-Tools CP-SAT (Apache-2.0) has `AddNoOverlap2D` for footprints and can
    maximise a companion score.
  - It runs in Python, so it fits a cloud Lambda for farms, greenhouses and
    food forests later.
- **A single bed** is about 12 × 30 cells, so the greedy placement plus local
  improvement of ADR 0021 is enough and runs in the browser.

So we extend our own planner. We keep our own curated crop library. Missing
attributes may later be filled from Growstuff, with its attribution and
licence kept in the file that uses them.

## Decision

### 1. Surface categories (`perma:SurfaceCategories`)

| Category | Status |
|---|---|
| `RectangleBedSurface` | One bed of square cells, up to 30 × 10 m |
| `BedFarmSurface` | Rectangle beds of one size in rows, with paths of 20–200 cm, up to 50 beds (`perma:BedFarm`, a bed's `perma:inFarm`) |
| `GreenhouseSurface`, `FoodForestSurface` | Removed by ADR 0028 until beds and farms are right; they will need their own planner (canopy, not cells) |

The shapes and `checkHabitat` hold the limits (`SURFACE_LIMITS`).

### 2. Plant sets (`perma:PlantSet`)

- **What a set holds:** its members, each with a library crop and a share of the
  room (`perma:share`, an area share, not a plant count), and the surfaces it
  is for.
- **The library's sets:** `abox/library/plantsets.ttl` → `plantSets.generated.ts`.
- **A space's own sets:** kept in its graph, with `perma:draft true` while they
  are proposals (a person's, or the edge agent's). A draft joins the library
  only by review, as a pull request.

### 3. Layers

`layerOf()` derives each crop's layer.

| Layer | Which crops |
|---|---|
| `tall` | Upright and 70 cm or more |
| `ground` | Covers the soil and is 40 cm or less |
| `mid` | The rest |

- **The overlap rule:** a ground cover may grow inside a tall plant's spacing,
  such as thyme or cucumber under a tomato. No other pair may share cells.
- **One plant per layer per cell**, so `cellTwice` counts the layer.
- **Why derived:** layers come from the height and the gifts already in the
  library, so there is no new data to keep.

### 4. The planner, `planFromSets()`

1. **Each set gets** its share of the free room, and each member its share
   within it.
2. **`plantCounts()`** turns area shares into plant numbers.
3. **`suggestPlanting()`** places the plants:
   - the biggest first, the ground covers last, into the tall plants'
     understorey where it suits them;
   - then it improves by swaps and moves;
   - a plant that still has a bad neighbour tries every swap that could part
     them.

   A bad neighbour now weighs −10 (it was −6). Otherwise a crop that fills the
   bed would rather sit by a bad neighbour than by its own kind.
4. **A farm of beds:** `shareOut()` gives each set beds by its share, at least
   one while there are beds enough. With fewer beds than sets, a bed takes two.
   `planFarm()` then plans each bed.

### 5. Planting by hand keeps the spacing

- **A refused click:** `plantingConflict()` refuses a plant that would stand
  inside another's spacing, and names that plant.
- **Shift+click** plants it anyway.
- **`crowdedCells()`** outlines what stands too close. This is a warning, not
  an error, so beds drawn earlier still save.

### 6. The edge agent uses the cloud's planner

`POST /edge/v1/plan` is served by `edgeGraphs`, with the same device token
and tenant check.
- **Without sets**, it lists the beds, farms and plant sets.
- **With sets**, it returns a plan and saves nothing.

On the edge:
- **`plan_options()`** lists what can be planned.
- **`plan_bed()`** gets a plan and proposes `/api/plan/apply`.
- **Applying needs a person:** only after a person confirms are the cells
  written as planned. The next sync takes them to the map.

The planner reaches the Lambda as a bundle of `packages/core`
(`backend/scripts/sync-planner.mjs`, with a drift test), the same way as the
ontology.

### 7. Delete

Each is a draft that needs Save, and confirms in two steps.
- **Clear a bed's planting.**
- **Remove a guild**, even a planted one: its bed, cells, water parts and
  learning cycles go with it.
- **Delete the whole map:** it keeps the triples the map does not know. To
  restore it, export the map first and import the file again.

## Consequences

- **The edge applies only what a person confirmed.** A plan is a proposal, as
  everything the agent does (ADR 0011).
- **Layered cells change some numbers.** A bed with ground covers under tall
  plants covers less of its area with plants alone, so the cover figure is
  lower for the same harvest.
- **Version history and restore** need the backend to keep earlier graph
  versions. Until then, the export file is the backup.
- **Open later:**
  - a `perma:layer` override where the derived layer is wrong;
  - CP-SAT for farms, greenhouses and food forests;
  - plant data from Growstuff.
