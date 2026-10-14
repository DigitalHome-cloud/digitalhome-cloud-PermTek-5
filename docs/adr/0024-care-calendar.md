# ADR 0024 — The care calendar: what keeps a guild working, and who does it

Status: **Accepted** · 2026-10-14 · Builds on [ADR 0020](0020-perma5guild-one-edge-per-guild.md), [ADR 0023](0023-worm-population.md)

## Context

A WormBed5 only keeps working if a list of small jobs is done on time: feed
and bed the worms, drain the sump, look the bed over for weeds, buffer the
box against acid, wrap it before frost, check the frame after a storm. Some
are the robot's, some a person's. They were scattered over the feeding
guide, the keeper's notices and nobody's memory.

## Decision

1. **The care calendar is data**, one file per guild type, like the feeding
   guide: `packages/ontology/guides/wormbed5-care.json`, exported to
   `CARE_GUIDE` in core. Each task has who does it (robot or person), a
   rhythm in days and/or months of the year, the keeper's reactions that
   bring it forward, and for the robot the twin edge's job that does it.
2. **One set of rules for "due"** (`packages/core/src/maintenance.ts`,
   `careDue()`): a rhythm has run out since it was last done; or one of its
   months has begun and it has not been done since; or a reaction of the
   keeper brings it forward (at most once a day). The twin edge follows the
   same rules in `maintenance.py`; the two are kept alike by their tests.
3. **The edge keeps the record.** A robot task is done when its job
   finishes; a person presses Done. The record stays on the edge for now.
4. **The cloud shows the plan**: the seasonal work month by month under the
   planting calendar, and this month's care and the rhythms in the Now view.

## Consequences

- The calendar can be corrected in one place, in three languages.
- Writing "done" back to the site's graph is not built: it needs an
  ontology class for a care task and an observation of it done, and it
  changes a real site's data. Until then the cloud cannot say what is
  overdue, only what the plan is.
- The rhythms are rules of thumb. A real bed will say which are too often.
