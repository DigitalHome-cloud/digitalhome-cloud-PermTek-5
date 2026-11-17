/**
 * A year in the bed: what to sow when, and where (docs/adr/0022).
 *
 * `suggestPlanting()` places plants as if every crop could go in today. It
 * cannot: a cucumber is not sown in October. This module joins the planting
 * with the calendar (calendar.ts): for each wanted crop, the month it can
 * first go into the bed from now on, how (sown in place, or raised under
 * cover and planted out), and until when it stands there. The bed is then
 * planted in WAVES, month by month, each wave placed mixed around what still
 * stands. When a crop is harvested its cells come free, and quick crops
 * (radish, rocket, lettuce, spinach) are sown into gaps that stay free long
 * enough: a succession.
 *
 * A plan for a person to follow or not. The calendar's months are derived
 * from the climate's normals and are "to confirm"; this year's weather may
 * differ. Only this month's wave is something to do now.
 */
import type { ClimateMonth } from "./habitat.js";
import { deriveWindows } from "./calendar.js";
import { cropById, isWoody } from "./library.js";
import { footprint, type Bed, type Cell } from "./habitatModel.js";
import { plantCounts, suggestPlanting, type PlantingOptions } from "./planting.js";

export type GoesIn = "SowOutdoors" | "PlantOut";

/** One plant of the plan: where, and from which month to which (1..12; `to` may lie in the next year). */
export interface Planting {
  row: number; col: number; cropId: string;
  how: GoesIn;
  from: number; to: number;
  /** Months from the plan's first month: 0 is now. For sorting and for "is it standing in month k". */
  fromOffset: number; toOffset: number;
  /** A quick crop sown into a gap between or after the main crops. */
  catchCrop?: boolean;
}

export interface CropSeason {
  cropId: string;
  /** When it first goes into the bed, and how; absent when it cannot this year. */
  how?: GoesIn; from?: number; fromOffset?: number;
  /** Raised under cover first: start it in this month. */
  startIndoors?: number; startIndoorsOffset?: number;
  /** Plants of it in the plan's main sowing (catch crops not counted). */
  plants?: number;
  /** tree / tooBig / noSpacing / unknown (from the planting), noWindow (no month suits it in this climate), noClimate,
   *  noRoom (its place is taken in its months). */
  why?: string;
}

export interface YearPlan {
  /** The plan's first month, 1..12. */
  month: number;
  crops: CropSeason[];
  plantings: Planting[];
  /** For each of the twelve months from `month` on: what happens and how full the bed is. */
  months: {
    month: number; offset: number;
    sow: Record<string, number>; plantOut: Record<string, number>;
    startIndoors: string[];
    /** Crops whose plants leave the bed at the end of this month. */
    cleared: Record<string, number>;
    /** Share of the bed's cells under a plant, 0..1. */
    cover: number;
  }[];
}

const HORIZON = 12;
const QUICK_MONTHS = 2;        // a catch crop is ready within this many months
const BIG_CELLS = 3;           // a plant this many cells wide is placed before the small ones
const CATCH_DEFAULT = 12;
const MIN_GAP_CELLS = 8;       // a gap smaller than this is left to the cover crop
const wrap = (m: number) => ((m - 1) % 12 + 12) % 12 + 1;

/** How many months a plant stands in the bed, counting the month it goes in. */
function stay(cropId: string, months: ClimateMonth[], offsetC: number, start: number, how: GoesIn): number {
  const crop = cropById(cropId)!;
  if (crop.lifeCycle === "Perennial") return HORIZON;
  const cal = deriveWindows(months, crop, offsetC);
  if (how === "PlantOut") {                              // it bears until the season closes
    const last = Math.max(start, ...cal.harvest.filter((m) => m >= start));
    return last - start + 1;
  }
  return Math.max(1, Math.round((crop.needs.daysToHarvest ?? 60) / 30)) + 1;      // grown, then picked over a month
}

/** When each wanted crop can first go into this bed from `month` on. */
export function cropSeasons(cropIds: string[], months: ClimateMonth[] | null, offsetC: number, month: number): CropSeason[] {
  return [...new Set(cropIds)].sort().map((cropId) => {
    const crop = cropById(cropId);
    if (!crop) return { cropId, why: "unknown" };
    if (isWoody(crop)) return { cropId, why: "tree" };
    if (!months) return { cropId, why: "noClimate" };
    const cal = deriveWindows(months, crop, offsetC);
    let best: CropSeason | undefined;
    for (let k = 0; k < HORIZON; k++) {
      const m = wrap(month + k);
      const how: GoesIn | undefined = cal.plantOut.includes(m) ? "PlantOut" : cal.sowOutdoors.includes(m) ? "SowOutdoors" : undefined;
      if (!how) continue;
      best = { cropId, how, from: m, fromOffset: k };
      if (how === "PlantOut" && cal.sowIndoors.length) {
        const lead = cal.plantOut[0] - cal.sowIndoors[0];                    // months under cover before it goes out
        if (k - lead >= 0) { best.startIndoors = wrap(m - lead); best.startIndoorsOffset = k - lead; }
      }
      break;
    }
    return best ?? { cropId, why: "noWindow" };
  });
}

/**
 * The year from `month` on: every wanted crop that has a month in this climate, placed mixed in the
 * bed in the month it can go in; then quick crops into the gaps. `existing` are the bed's cells now:
 * they stand (perennials for the year, others for their crop's time).
 */
export function yearPlan(bed: Bed, cropIds: string[], months: ClimateMonth[] | null, offsetC: number, month: number,
  existing: Cell[] = [], weights: Record<string, number> = {}, opts: PlantingOptions = {}): YearPlan {
  const seasons = cropSeasons(cropIds, months, offsetC, month);
  const empty: YearPlan = { month, crops: seasons, plantings: [], months: [] };
  if (!months) return empty;

  // A cover crop that no recipe asked for gives way: it is cut where a crop is to go, so it does not count as standing.
  const wanted = new Set(cropIds);
  const here = existing.filter((c) => c.bedId === bed.id && c.status !== "CellHarvested" && !givesWay(c.cropId, wanted));
  // what stands already: a perennial for the year; anything else as long as its crop takes from being sown now
  const standing: Planting[] = here.map((c) => {
    const crop = cropById(c.cropId);
    const months_ = !crop || crop.lifeCycle === "Perennial" ? HORIZON : Math.max(1, Math.round((crop.needs.daysToHarvest ?? 60) / 30)) + 1;
    return { row: c.row, col: c.col, cropId: c.cropId, how: "SowOutdoors", from: month, to: wrap(month + months_ - 1), fromOffset: 0, toOffset: Math.min(HORIZON, months_) - 1 };
  });
  const asCells = (ps: Planting[]): Cell[] => ps.map((p, i) => ({ id: `s${i}`, bedId: bed.id, row: p.row, col: p.col, cropId: p.cropId, status: "CellGrowing" }));
  const overlapping = (ps: Planting[], a: number, b: number) => ps.filter((p) => p.fromOffset <= b && p.toOffset >= a);

  const growable = seasons.filter((s) => s.how);
  const counts = plantCounts(bed, growable.map((s) => s.cropId), here, weights, opts);
  for (const s of seasons) {
    if (s.how && !counts[s.cropId]) { delete s.how; delete s.from; delete s.fromOffset; delete s.startIndoors; delete s.startIndoorsOffset; s.why = unfitWhy(s.cropId, bed); }
  }

  const placed: Planting[] = [];
  // Big plants first, whatever their month: a pepper needs sixteen cells together in June, and gets them
  // before the small early crops are placed. Those may still use its cells while it is not there yet.
  const big = (s: CropSeason) => footprint(s.cropId, bed) >= BIG_CELLS;
  const groups = [true, false].flatMap((isBig) => {
    const of = growable.filter((s) => s.how && big(s) === isBig);
    return [...new Set(of.map((s) => s.fromOffset!))].sort((a, b) => a - b).map((k) => of.filter((s) => s.fromOffset === k));
  });
  for (const wave of groups) {
    const k = wave[0].fromOffset!;
    const stays = Object.fromEntries(wave.map((s) => [s.cropId, stay(s.cropId, months, offsetC, s.from!, s.how!)]));
    const until = Math.min(HORIZON - 1, k + Math.max(...Object.values(stays)) - 1);
    const around = overlapping([...standing, ...placed], k, until);
    const wants = Object.fromEntries(wave.map((s) => [s.cropId, counts[s.cropId]]));
    const s = suggestPlanting(bed, wants, asCells(around), { ...opts, seed: (opts.seed ?? 5) + k });
    for (const p of s.cells) {
      const season = wave.find((w) => w.cropId === p.cropId)!;
      const to = Math.min(HORIZON - 1, k + stays[p.cropId] - 1);
      placed.push({ ...p, how: season.how!, from: season.from!, to: wrap(month + to), fromOffset: k, toOffset: to });
    }
    for (const c of s.crops) {
      const season = wave.find((w) => w.cropId === c.cropId)!;
      season.plants = c.placed;
      if (c.placed === 0) { delete season.how; delete season.from; delete season.fromOffset; delete season.startIndoors; delete season.startIndoorsOffset; season.why = "noRoom"; }
    }
  }

  // Succession: quick crops into gaps that stay free long enough for them.
  const quick = seasons.filter((s) => {
    const crop = cropById(s.cropId);
    return crop && !isWoody(crop) && crop.lifeCycle !== "Perennial" && !crop.needs.frostTender
      && Math.round((crop.needs.daysToHarvest ?? 999) / 30) <= QUICK_MONTHS && !unfitWhy(s.cropId, bed);
  }).map((s) => s.cropId);
  const cells = Math.ceil(bed.widthCm / bed.cellCm) * (Math.ceil(bed.lengthCm / bed.cellCm) - Math.ceil((bed.wormBinCm ?? 0) / bed.cellCm));
  for (let k = 0; k < HORIZON && quick.length; k++) {
    const m = wrap(month + k);
    // (not in the month of the crop's own main sowing: that is in the bed already)
    const sowable = quick.filter((id) => deriveWindows(months, cropById(id)!, offsetC).sowOutdoors.includes(m)
      && seasons.find((s) => s.cropId === id)?.fromOffset !== k);
    if (!sowable.length) continue;
    const stays = Object.fromEntries(sowable.map((id) => [id, stay(id, months, offsetC, m, "SowOutdoors")]));
    const until = Math.min(HORIZON - 1, k + Math.max(...Object.values(stays)) - 1);
    const around = overlapping([...standing, ...placed], k, until);
    const used = around.reduce((sum, p) => sum + footprint(p.cropId, bed) ** 2, 0);
    if (cells - used < MIN_GAP_CELLS) continue;
    // as many as the gap takes, but of each crop no more than the household's main sowing of it: nobody eats a hundred rockets
    const room = plantCounts(bed, sowable, asCells(around), weights, opts);
    const wants = Object.fromEntries(Object.entries(room).map(([id, n]) => [id, Math.min(n, counts[id] ?? CATCH_DEFAULT)]));
    const s = suggestPlanting(bed, wants, asCells(around), { ...opts, seed: (opts.seed ?? 5) + 100 + k });
    for (const p of s.cells) {
      const to = Math.min(HORIZON - 1, k + stays[p.cropId] - 1);
      placed.push({ ...p, how: "SowOutdoors", from: m, to: wrap(month + to), fromOffset: k, toOffset: to, catchCrop: true });
    }
  }

  const count = (ps: Planting[]) => ps.reduce<Record<string, number>>((acc, p) => { acc[p.cropId] = (acc[p.cropId] ?? 0) + 1; return acc; }, {});
  const plan: YearPlan["months"] = [];
  for (let k = 0; k < HORIZON; k++) {
    const stands = overlapping([...standing, ...placed], k, k);
    plan.push({
      month: wrap(month + k), offset: k,
      sow: count(placed.filter((p) => p.fromOffset === k && p.how === "SowOutdoors")),
      plantOut: count(placed.filter((p) => p.fromOffset === k && p.how === "PlantOut")),
      startIndoors: seasons.filter((s) => s.startIndoorsOffset === k).map((s) => s.cropId),
      cleared: count([...standing, ...placed].filter((p) => p.toOffset === k && k < HORIZON - 1)),
      cover: Math.round((stands.reduce((sum, p) => sum + footprint(p.cropId, bed) ** 2, 0) / Math.max(1, cells)) * 100) / 100,
    });
  }
  placed.sort((a, b) => a.fromOffset - b.fromOffset || a.row - b.row || a.col - b.col);
  return { month, crops: seasons, plantings: placed, months: plan };
}

/** A cover crop in the bed that is not one of the wanted crops: it yields its cell to them. */
export const givesWay = (cropId: string, wanted: Set<string> | string[]): boolean =>
  !!cropById(cropId)?.coverCrop && !(wanted instanceof Set ? wanted.has(cropId) : wanted.includes(cropId));

function unfitWhy(cropId: string, bed: Bed): string | undefined {
  const crop = cropById(cropId);
  if (!crop) return "unknown";
  if (isWoody(crop)) return "tree";
  if (!crop.needs.spacingCm) return "noSpacing";
  const f = footprint(cropId, bed);
  return f > Math.ceil(bed.widthCm / bed.cellCm) || f > Math.ceil(bed.lengthCm / bed.cellCm) - Math.ceil((bed.wormBinCm ?? 0) / bed.cellCm) ? "tooBig" : undefined;
}

/** The plants standing in the bed in the plan's month `offset` (0 is now). */
export const standingIn = (plan: YearPlan, offset: number): Planting[] =>
  plan.plantings.filter((p) => p.fromOffset <= offset && p.toOffset >= offset);
