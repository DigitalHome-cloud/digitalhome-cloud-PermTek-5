# ADR 0029: Growing periods: the bed's target over the year

Status: **Accepted** · 2026-10-16 · Builds on [ADR 0022](0022-a-year-in-the-bed.md), [ADR 0027](0027-plant-sets-and-surface-categories.md), [ADR 0028](0028-a-guided-wormbed5-map.md)

## Context

Testing the Map with the twin edge on 2026-10-16 mixed up two things.

**A cell was both the target and the state.**
- A planned cell on the Map says what the bed should become.
- Its status (sown, growing) says how far it has got.
- The twin edge prepared its world from the space as it stood, sowed in the simulation, and wrote "sown" back into
  the real space.
- So 22 cells on the stage space showed as sown although nothing was sown on the roof.

**A bed's year had no shape.**
- The owner sees an active time from sowing to harvest and a winter or maintenance time.
- There may be several sowing-to-harvest times in a year, each with other plant sets.
- The Map had one set of cells per bed, and the twin had no plants that grow, ripen or die, so "starting a bed from
  clean to its target" could not be rehearsed.

## Decision

### 1. The Map holds the target; the twin edge rehearses it

- **The cells on the Map are the target.** A person plans them, from plant sets or by hand.
- **The twin edge simulates how to get there:** sowing, plants coming up or not, resowing, growth and harvest.
- **A twin run is a rehearsal and writes nothing into the space.** A later "real bed" mode (sensors and the real
  gantry) will record what was really done; that is a separate decision.

### 2. A bed's year in periods (`perma:GrowingPeriod`, `packages/core/src/periods.ts`)

| Property | Meaning |
|---|---|
| `perma:ofBed` | its bed |
| `perma:fromMonth`, `perma:toMonth` | 1..12; ending before it starts runs over New Year |
| `perma:periodKind` | `GrowingKind` or `RestKind` (`perma:PeriodKinds`) |
| `perma:setChoice` | `perma:plantSet` + `perma:share`: the sets it is planted from; a rest's is its cover crop |

- **A cell may say `perma:inPeriod`:** it is that period's target. A cell without one is "the bed as it stands", so
  maps from before periods keep working.
- **Two periods of a bed may use the same cell;** `checkHabitat` counts a cell twice only within one period.
- **A bed's periods do not overlap.** The core checks this, since SHACL core cannot.
- **`CellLost` is a new cell status:** the sowing did not come up, froze or dried out, and the cell is free to sow
  again.
- **`checkPeriod`** warns when a crop cannot go in during the period in this climate, or would not be ready before it
  ends. It uses the calendar of ADR 0022.
- **Things that read "what stands now"** (Now, the recipe planner, the preview) use `standingCells`: the cells of no
  period plus those of the period the month lies in.

### 3. The Map

- **The bed card shows the bed's year:** a strip of twelve months, with growing in green and rest in grey.
  - "Set up a year" makes April–September growing and October–March rest, and moves what the bed holds into the
    growing period.
  - Periods can be added, renamed, given other months (never overlapping) and removed with their cells.
- **The grid shows one period's target.** Planting by hand and "Plan from plant sets" plan that period, and the sets
  chosen are kept on it.
- **A farm plans a period by months.** It is made in every bed whose year has those months free.
- **`/edge/v1/plan` takes `periodId` or `month`** and returns each plan with its period. The edge writes the cells
  into it.

### 4. The twin edge (`permtek5-twin-edge`)

**Prepare shows the target before it makes the world:**
- the bed, its periods and the chosen period's cells;
- the habitat defaults to the space, not the invented CityDemo;
- "Latest from the cloud first" syncs before the world is made;
- the start is "From a clean bed" (every target cell planned, the clock at the period's first month) or "As the bed
  stands".

**Plants live in the twin** (`ros2/.../plants.py`):
- **Coming up:** a plant comes up after its crop's germination days, counted only on warm, moist days; some never do.
- **Growing:** it grows with the day's warmth and is ready after its days to harvest, while its mesh grows with it.
- **Losses:** frost kills tender crops under 0 °C and any crop under -6 °C; two dry days below the wilting point kill
  any.

**The robot proposes, and a person confirms:**
- sowing only what the run's period plans, never in a rest, and only when the day is warm enough for the crop;
- resowing lost cells.

**A person's part:**
- harvest and clear what is ready;
- at the period's end, clear what still stands and move on to the next period, whose target becomes the plan.

**The worm box's care goes on in every period.** The care calendar's seasonal tasks (wrap, unwrap, cover crop) stay
as they were.

**Scenarios come in two groups:**
- **"The bed: from clean to target"** and **"A year of periods"** (new);
- **the guild's care and the worm box:** the existing scenarios.

## Consequences

- **The space shows only what a person planned,** and later what the real bed reports. A rehearsal can be run as
  often as wanted.
- **The 22 cells written on 2026-10-16 were set back to planned** and synced (stage space version 29).
- **The twin's growth is rules of thumb** from the crop library: germination and harvest days, sowing temperature,
  frost tenderness. Watering, weeds and the worm box act on it only through moisture.
- **Open:**
  - the "real bed" mode and what it writes;
  - periods for a farm as a whole (now made per bed);
  - the twin's growth checked against real beds (a learning cycle, ADR 0026).
