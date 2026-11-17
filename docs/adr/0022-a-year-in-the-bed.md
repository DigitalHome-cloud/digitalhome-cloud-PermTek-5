# ADR 0022 — A year in the bed: the planting follows the calendar

Status: **Accepted** · 2026-10-10 · Builds on [ADR 0016](0016-habitat-model-zones-beds-cells-trees.md), [ADR 0021](0021-recipes-drive-a-mixed-planting.md)

## Context

The mixed planting of ADR 0021 placed every wanted crop as if it could go in
today. In October it put cucumbers and peppers into the bed. The calendar
(ADR 0016) already knows, from the area's climate, in which months each crop
can be sown or planted out; the two were not joined. And a bed is not planted
once: when the radish is pulled its cell is free again.

## Decision

1. **The planting is a plan for twelve months from a chosen month**
   (`packages/core/src/season.ts`, `yearPlan()`).
2. **Each wanted crop goes in in the first month that suits it** from then
   on, by the calendar's rules for the bed's area and its zone's microclimate:
   sown in place, or raised under cover and planted out. The plan says when to
   start the tender ones under cover.
3. **It stands as long as its crop takes**: a perennial for the year; a
   planted-out crop until its last harvest month; any other for its months to
   harvest plus one month of picking.
4. **The bed is planted in waves**, month by month, each placed mixed around
   what stands in its months (`suggestPlanting()`). Big plants are placed
   first, whatever their month, so a pepper finds its sixteen cells in June;
   small early crops may use those cells until then.
5. **Succession**: quick crops (ready within two months, not frost-tender) are
   sown again into gaps that stay free long enough, each month they can be
   sown, in numbers no larger than the household's main sowing of them.
6. **A cover crop takes this month's bare cells** when it can be sown now, and
   **gives way** to a crop whose month comes: a cover crop no recipe asked for
   does not count as standing.
7. **Only this month's plants are accepted**; next month the plan is asked
   again, around what then stands. Without a climate for the area there is no
   year, and the app falls back to the planting of ADR 0021 and says so.

## Consequences

- The plan is only as good as the calendar's derived months, which come from
  long-term monthly means and are "to confirm". In a mild climate they allow
  winter sowings a gardener would not make.
- What stands in the bed already is assumed to have been sown this month,
  because most cells carry no sowing date. A bed with older plants frees up
  sooner than the plan says.
- Quick crops are sown every month they can be. That is a succession, but it
  is more rocket and radish than most households eat; the numbers are a
  starting point to cut down.
- There is still no rotation from one year to the next. The plan knows the
  families; it does not yet remember last year.
- The twin edge sows what is accepted, one planned cell at a time, as before.
