# ADR 0026 — Learning cycles in the graph: the habitat's second brain

Status: **Accepted** · 2026-10-14 · Builds on [ADR 0007](0007-knowledge-as-a-graph-per-space.md), [ADR 0024](0024-care-calendar.md)

## Context

The roof bed is a model. It is there to start a learning curve, not to be right the first time. The sizing
hypothesis says what we expect: how much the worms turn over, into how much liquid and castings, whether the box
fits the bed, how much water rain brings. It says so as numbers with ranges, and plans to measure them for a
season. A document cannot hold the measurements, the verdicts, or what was changed because of them. Nor can an edge
fill one in.

## Decision

1. **A new ontology module, `perma-learning`**, beside the habitat module, in the same graph (ADR 0007):
   - a **learning cycle** about a guild or one of its parts, with its phase: plan, do, check or act;
   - its **hypotheses**: a number expected, the lowest and highest that hold, a unit, a source, a verdict
     (open, holds, fails), and what was changed;
   - each hypothesis's **measure**: how, how often, and which edge reading fills it;
   - **checks**: one measured number on a day by a person or an edge, as a `sosa:Observation`.

   The shapes keep `low ≤ expected ≤ high`.
2. **Starter sets are data**, like the guides: `guides/wormbed5-sizing.json` (H1–H7 and their measures, EN/DE/FR),
   exported to `SIZING_GUIDE`. "Adopt" makes it a cycle about a guild, in its Plan phase.
3. **One rule for verdicts** (`packages/core/src/learning.ts`):
   - a hypothesis holds while its last check lies in its range;
   - it fails when two checks running lie outside it, or the last one at the season's end does;
   - with no checks, or after one check outside, it is open.
4. **The app's Learn view**:
   - per guild, its cycles, with the phases as steps;
   - in Plan, the numbers are edited;
   - in Do and Check, values are added and the due measures listed; each value is a dot on a strip against
     the range;
   - in Act, what was changed is written, and the next cycle starts with the new numbers.
5. **The guild's edge reads the cycles** from the synced graph. Writing its measured values back as checks comes
   later, because that changes a real site's data.

## Consequences

- The second brain is per habitat and per guild, in the habitat's graph. It is readable by the site's readers,
  editable by its admins, and seen by its edge.
- The 400 KB item limit allows years of monthly checks for a guild. A large history would move to the observation
  store (DynamoDB and Parquet, `docs/build-plan.md`), with the graph keeping the verdicts.
- The same pattern serves any question a site asks of itself: a new starter set is a JSON file, not a release.
