# ADR 0016 — A habitat is mapped as zones, beds of cells, and garden plants

Status: **Accepted** · 2026-10-09 · Builds on [ADR 0015](0015-tenant-is-a-habitat-of-a-dhc-home.md)

## Context

The first habitat is a city home with a small flat roof and a small garden
with fruit trees. The owner wants to map it in the app and get a calendar from
the area's climate: what to sow, plant, prune and harvest, and when. Later a
FarmBot-like gantry works the roof bed. The vegetation map (ADR 0012) is for
open land drawn on a geographic map; a roof bed and three trees in a back
garden need less, and nothing geographic.

## Decision

1. **Four classes** in a new module, `perma-habitat.ttl`:
   - `perma:GardenZone`: the roof, the garden, a balcony or a greenhouse.
     It has an exposure and a **microclimate offset** (°C) added to the
     area's monthly normals: about +1 on a roof.
   - `perma:GrowingBed`: a rectangle in a zone, split into square cells
     (10 cm by default). A new bed defaults to 300 × 100 cm.
   - `perma:PlantingCell`: one plant or sowing point (row, column, crop,
     status planned → sown → growing → harvested). Only planted cells are
     stored, and the crop's spacing gives the cells it covers. The gantry will
     address the same cells.
   - `perma:GardenPlant`: a long-lived plant at x/y metres inside its zone,
     e.g. a fruit tree. It is not a `perma:Plant` of the vegetation map,
     which needs a geometry.
2. **One graph per habitat**: the shared space's A-Box, saved through
   `saveGraph` with a version (ADR-0007). The graph Lambda now validates
   against the perma modules too (`sync-ontology.mjs`). The app reads and
   writes only these four classes and keeps every other triple as it was.
3. **Crops by IRI**: cells and trees link the shared library with `perma:grows`.
   The Lambda has no library, so its shapes check the IRI pattern.
   `packages/core` checks the rest (a known crop, a cell inside its bed, one
   cell per spot).
4. **A calendar from the climate, not from a list**:
   - The library states what each annual needs: sow from a mean
     temperature, plant out from a night temperature, bolts above a maximum,
     frost-tender, days to harvest, spacing.
   - `packages/core/src/calendar.ts` derives the months from the area's
     monthly normals plus the zone's offset.
   - Trees have **typical windows** (flowering, winter and summer pruning,
     harvest) and a **late-frost warning** when they flower in a month whose
     mean minimum is under 5 °C.
   - Everything is *to confirm*. A site's own `perma:SeasonWindow`s (the
     site calendars of ADR 0012) take precedence when the app reads them, a
     later step.
5. **What a seeder needs is in the A-Box**, so a gantry (ADR 0017) can work
   from it alone:
   - per crop: sowing depth (mm), seeds per point, days to germinate, water
     (mm per week), spacing;
   - per cell: optional depth and seed overrides.
   - `sowingJob(habitat, cell)` turns a cell into bed coordinates (mm from the
     corner of row 0 / column 0, x along the length, y across the width, the
     cell's centre), plus depth, seeds, clearance and when to check
     germination.
   - Machine calibration (where the bed's corner and the soil surface are for
     the gantry) stays on the robot edge.
6. **The library reaches the app as generated TypeScript**
   (`tools/export_library.py` → `packages/core/src/library.generated.ts`),
   with a drift test, like the Lambda's copy of the shapes.

## Consequences

- A habitat's map is private data: it lives in the cloud, in the habitat's
  shared space, never in this repository. The public example is the
  invented **CityDemo** (`abox/examples/citydemo-habitat.ttl`).
- Monthly normals are coarse. A month is either in or out, and the
  thresholds are general practice; the calendar is a starting point to correct.
- n3 is now a dependency of `packages/core` (pure JS, used for the habitat's
  Turtle).
- The gantry robot (ADR 0017) plans jobs on cells and changes their status;
  nothing in this model is specific to hand or robot work.
