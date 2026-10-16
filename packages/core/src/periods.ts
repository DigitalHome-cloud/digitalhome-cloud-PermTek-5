/**
 * A bed's year in periods (docs/adr/0029): growing periods, each planted from its plant sets with its own target
 * (the cells that say `periodId`), and rest periods (winter or maintenance: a cover crop at most). The Map holds
 * the target; the twin edge rehearses getting there from a clean bed.
 *
 * A bed's periods are by month and do not overlap (checkHabitat). Cells without a period are the bed as it
 * stands: a map from before periods keeps working, as one "current" period.
 */
import type { ClimateMonth } from "./habitat.js";
import { deriveWindows } from "./calendar.js";
import { cropById, isWoody } from "./library.js";
import { monthsOf, newId, type Bed, type BedPeriod, type Cell, type Habitat, type PeriodKind } from "./habitatModel.js";
import { plantSetById, type PlantSet } from "./plantSets.js";

export { monthsOf };

/** A bed's periods, by their first month. */
export const periodsOf = (h: Habitat, bedId: string): BedPeriod[] =>
  (h.periods ?? []).filter((p) => p.bedId === bedId).sort((a, b) => a.fromMonth - b.fromMonth);

/** The period a month (1..12) of the bed's year lies in. */
export const periodAt = (h: Habitat, bedId: string, month: number): BedPeriod | undefined =>
  periodsOf(h, bedId).find((p) => monthsOf(p).includes(month));

/** A period's target: its cells. Without a period, the bed as it stands (cells that name no period). */
export const periodCells = (h: Habitat, bedId: string, periodId?: string): Cell[] =>
  h.cells.filter((c) => c.bedId === bedId && (c.periodId ?? "") === (periodId ?? ""));

/** What stands in a bed in a month (1..12): the cells of no period, and those of the period the month lies in. */
export const standingCells = (h: Habitat, bedId: string, month: number): Cell[] => {
  const now = periodAt(h, bedId, month)?.id ?? "";
  return h.cells.filter((c) => c.bedId === bedId && (!c.periodId || c.periodId === now));
};

export function newPeriod(bed: Bed, name: string, kind: PeriodKind, fromMonth: number, toMonth: number,
  sets: BedPeriod["sets"] = []): BedPeriod {
  return { id: newId("period"), bedId: bed.id, name, kind, fromMonth, toMonth, sets };
}

/** A first year: growing from April to September, then rest until March. */
export function defaultPeriods(bed: Bed, names: { growing: string; rest: string }): BedPeriod[] {
  return [newPeriod(bed, names.growing, "GrowingKind", 4, 9), newPeriod(bed, names.rest, "RestKind", 10, 3)];
}

/** Months of the year still free for a new period of this bed. */
export function freeMonths(h: Habitat, bedId: string, except?: string): number[] {
  const taken = new Set(periodsOf(h, bedId).filter((p) => p.id !== except).flatMap(monthsOf));
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((m) => !taken.has(m));
}

/** Whether a period would fit the bed's year beside its other periods. */
export const periodFits = (h: Habitat, p: BedPeriod): boolean => {
  const free = new Set(freeMonths(h, p.bedId, p.id));
  return monthsOf(p).every((m) => free.has(m));
};

/** The crops a period's sets ask for. */
export const periodCrops = (p: BedPeriod, own: PlantSet[] = []): string[] =>
  [...new Set(p.sets.flatMap((c) => plantSetById(c.setId, own)?.members.map((m) => m.cropId) ?? []))].sort();

export interface PeriodWarning {
  cropId: string;
  /** noSow: no month of the period suits sowing or planting it out here; notReady: sown at the first month it
   *  can, it is not ready before the period ends. */
  why: "noSow" | "notReady";
  /** For noSow: the first month it could go in; for notReady: the month it would be ready. */
  month?: number;
}

/**
 * What does not fit a growing period in this climate, by the calendar (calendar.ts): a crop that cannot go in
 * during the period, or that would not be ready before it ends. Without a climate there is nothing to say.
 * Perennials and woody crops stay beyond a period, so only their start is checked.
 */
export function checkPeriod(p: BedPeriod, cropIds: string[], months: ClimateMonth[] | null, offsetC = 0): PeriodWarning[] {
  if (p.kind !== "GrowingKind" || !months) return [];
  const span = monthsOf(p);
  const out: PeriodWarning[] = [];
  for (const cropId of [...new Set(cropIds)].sort()) {
    const crop = cropById(cropId);
    if (!crop) continue;
    const cal = deriveWindows(months, crop, offsetC);
    const goesIn = new Set([...cal.sowOutdoors, ...cal.plantOut]);
    const k = span.findIndex((m) => goesIn.has(m));
    if (k < 0) {
      const first = [...goesIn].sort((a, b) => a - b)[0];
      out.push({ cropId, why: "noSow", ...(first !== undefined && { month: first }) });
      continue;
    }
    if (isWoody(crop) || crop.lifeCycle === "Perennial") continue;
    const grown = Math.max(1, Math.round((crop.needs.daysToHarvest ?? 60) / 30));
    if (k + grown > span.length - 1) out.push({ cropId, why: "notReady", month: ((span[k] - 1 + grown) % 12) + 1 });
  }
  return out;
}
