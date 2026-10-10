/**
 * A habitat's calendar, derived from its area's climate (docs/adr/0016).
 *
 * Annual and herb crops: from what the crop needs (crops.ttl) and the area's
 * monthly normals (the mean of the daily minimum, mean and maximum), shifted by
 * the zone's microclimate offset. Woody crops (fruit trees): their typical
 * windows, plus a warning when they flower in a month whose nights still risk
 * frost. Everything here is general practice, "to confirm" by the site's own
 * records; nothing is a promise.
 */
import type { ClimateMonth } from "./habitat.js";
import type { Activity, LibraryCrop } from "./library.js";
import { isWoody, monthSpan } from "./library.js";

/** A month whose mean daily minimum is under this has frost nights. Same as ClimateMonth.frostRisk. */
export const FROST_RISK_MIN_C = 5;
/** Leafy and root crops keep growing (and can be picked) while the monthly mean is at least this. */
const HARDY_ALIVE_MEAN_C = 5;
/** A frost-tender crop gives up when nights fall this far below its planting-out threshold. */
const TENDER_MARGIN_C = 3;
/** Raised under cover before planting out (months). */
const INDOOR_MONTHS = 2;

export interface CropCalendar {
  cropId: string;
  sowIndoors: number[];
  sowOutdoors: number[];
  plantOut: number[];
  harvest: number[];
  flowering: number[];
  winterPrune: number[];
  summerPrune: number[];
  /** Flowering months whose nights still risk frost: watch the forecast, fleece small trees. */
  lateFrost: number[];
  /** derived: from the crop's needs and the climate; typical: the library's windows; none: no rule yet. */
  basis: "derived" | "typical" | "none";
}

interface T { min: number; mean: number; max: number }

function temps(months: ClimateMonth[], offsetC: number): (T | null)[] {
  const out: (T | null)[] = Array(13).fill(null);
  for (const m of months) {
    if (m.minC === null || m.meanC === null || m.maxC === null) continue;
    out[m.month] = { min: m.minC + offsetC, mean: m.meanC + offsetC, max: m.maxC + offsetC };
  }
  return out;
}

const empty = (cropId: string, basis: CropCalendar["basis"]): CropCalendar => ({
  cropId, sowIndoors: [], sowOutdoors: [], plantOut: [], harvest: [],
  flowering: [], winterPrune: [], summerPrune: [], lateFrost: [], basis,
});

const uniqSorted = (xs: number[]) => [...new Set(xs)].sort((a, b) => a - b);

/** The calendar of one crop in one zone. `months` may be null when the area has no climate yet. */
export function deriveWindows(months: ClimateMonth[] | null, crop: LibraryCrop, offsetC = 0): CropCalendar {
  if (isWoody(crop)) return typicalWindows(months, crop, offsetC);
  const n = crop.needs;
  if (!months || n.sowMinTempC === undefined || n.daysToHarvest === undefined) return empty(crop.id, "none");

  const t = temps(months, offsetC);
  const lag = Math.max(1, Math.round(n.daysToHarvest / 30));
  const tender = !!n.frostTender;
  const night = n.plantOutMinNightC ?? 0;
  const alive = (m: number) => {
    const x = t[m];
    return !!x && (tender ? x.min >= night - TENDER_MARGIN_C : x.mean >= HARDY_ALIVE_MEAN_C);
  };
  const reach = (m: number, k: number) => m + k <= 12 && alive(m + k);
  const perennial = crop.lifeCycle === "Perennial" || crop.lifeCycle === "Biennial";
  const cal = empty(crop.id, "derived");

  // Sown where it grows: warm enough, not bolting, frost-safe for tender crops,
  // and ready before the season closes. Slow tender crops are not sown outdoors.
  if (!tender || lag <= 3) {
    for (let m = 1; m <= 12; m++) {
      const x = t[m];
      if (!x || x.mean < n.sowMinTempC) continue;
      if (n.boltAboveC !== undefined && x.max >= n.boltAboveC) continue;
      if (tender && x.min < night) continue;
      if (reach(m, lag)) cal.sowOutdoors.push(m);
    }
  }

  // Frost-tender crops: raised under cover, planted out once nights allow.
  if (tender) {
    const grown = Math.max(1, lag - INDOOR_MONTHS);
    for (let m = 1; m <= 12 && cal.plantOut.length < 2; m++) {
      const x = t[m];
      const ok = !!x && x.min >= night && reach(m, grown);
      if (ok && (cal.plantOut.length === 0 || cal.plantOut[cal.plantOut.length - 1] === m - 1)) cal.plantOut.push(m);
      else if (cal.plantOut.length) break;
    }
    if (cal.plantOut.length) {
      const first = cal.plantOut[0];
      for (let m = Math.max(1, first - INDOOR_MONTHS); m < first; m++) cal.sowIndoors.push(m);
      for (let m = first + grown; m <= 12 && alive(m); m++) cal.harvest.push(m);
    }
  }

  if (perennial) {
    // Once established, picked whenever it grows.
    for (let m = 1; m <= 12; m++) if (alive(m)) cal.harvest.push(m);
  } else {
    for (const s of cal.sowOutdoors) cal.harvest.push(s + lag);
  }
  cal.harvest = uniqSorted(cal.harvest);
  return cal;
}

function typicalWindows(months: ClimateMonth[] | null, crop: LibraryCrop, offsetC: number): CropCalendar {
  if (!crop.windows.length) return empty(crop.id, "none");
  const cal = empty(crop.id, "typical");
  const key: Partial<Record<string, keyof CropCalendar>> = {
    SowIndoors: "sowIndoors", SowOutdoors: "sowOutdoors", PlantOut: "plantOut", Harvest: "harvest",
    Flowering: "flowering", WinterPrune: "winterPrune", SummerPrune: "summerPrune",
  };
  for (const w of crop.windows) {
    const k = key[w.activity];
    if (k) (cal[k] as number[]).push(...monthSpan(w.from, w.to));
  }
  for (const k of Object.values(key)) (cal[k!] as number[]) = uniqSorted(cal[k!] as number[]);
  if (months) {
    const t = temps(months, offsetC);
    cal.lateFrost = cal.flowering.filter((m) => !!t[m] && t[m]!.min < FROST_RISK_MIN_C);
  }
  return cal;
}

/** Is `month` in the calendar's months for this activity? */
export function activitiesIn(cal: CropCalendar, month: number): Activity[] {
  const out: Activity[] = [];
  if (cal.sowIndoors.includes(month)) out.push("SowIndoors");
  if (cal.sowOutdoors.includes(month)) out.push("SowOutdoors");
  if (cal.plantOut.includes(month)) out.push("PlantOut");
  if (cal.flowering.includes(month)) out.push("Flowering");
  if (cal.winterPrune.includes(month)) out.push("WinterPrune");
  if (cal.summerPrune.includes(month)) out.push("SummerPrune");
  if (cal.harvest.includes(month)) out.push("Harvest");
  return out;
}
