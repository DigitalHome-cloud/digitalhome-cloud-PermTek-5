/**
 * What to do now in a habitat: this month's work from its calendar
 * (docs/adr/0016). Suggestions, all "to confirm": a person decides.
 */
import type { ClimateMonth } from "./habitat.js";
import { activitiesIn, deriveWindows, type CropCalendar } from "./calendar.js";
import { cropById, crops, isWoody, type Activity } from "./library.js";
import { zoneOffset, type Habitat } from "./habitatModel.js";

export interface NowItem {
  activity: Activity;
  cropId: string;
  zoneId: string;
  /** The cells (grouped per bed) or garden plants it concerns; the bed for a suggestion. */
  subjects: string[];
  /** Not in the habitat yet: the crop could be sown or planted here this month. */
  suggestion: boolean;
  /** Flowering with frost nights still likely. */
  lateFrost?: boolean;
}

export function whatNow(h: Habitat, months: ClimateMonth[] | null, month: number): NowItem[] {
  const items: NowItem[] = [];
  const cals = new Map<string, CropCalendar>();
  const cal = (cropId: string, zoneId: string) => {
    const key = `${cropId}|${zoneId}`;
    if (!cals.has(key)) {
      const crop = cropById(cropId);
      if (crop) cals.set(key, deriveWindows(months, crop, zoneOffset(h, zoneId)));
    }
    return cals.get(key);
  };

  for (const bed of h.beds) {
    const groups = new Map<string, string[]>();
    for (const c of h.cells.filter((x) => x.bedId === bed.id)) {
      const phase = c.status === "CellPlanned" ? "plan" : c.status === "CellHarvested" ? "done" : "grow";
      const k = `${c.cropId}|${phase}`;
      groups.set(k, [...(groups.get(k) ?? []), c.id]);
    }
    for (const [k, ids] of groups) {
      const [cropId, phase] = k.split("|");
      const c = cal(cropId, bed.zoneId);
      if (!c || phase === "done") continue;
      for (const a of activitiesIn(c, month)) {
        const fits = phase === "plan" ? ["SowIndoors", "SowOutdoors", "PlantOut"].includes(a) : a === "Harvest";
        if (fits) items.push({ activity: a, cropId, zoneId: bed.zoneId, subjects: ids, suggestion: false });
      }
    }
    // What else the bed could take this month.
    const present = new Set(h.cells.filter((x) => x.bedId === bed.id && x.status !== "CellHarvested").map((x) => x.cropId));
    for (const crop of crops()) {
      if (isWoody(crop) || present.has(crop.id)) continue;
      const c = cal(crop.id, bed.zoneId);
      if (!c) continue;
      for (const a of activitiesIn(c, month)) {
        if (a === "SowOutdoors" || a === "SowIndoors" || a === "PlantOut") {
          items.push({ activity: a, cropId: crop.id, zoneId: bed.zoneId, subjects: [bed.id], suggestion: true });
        }
      }
    }
  }

  for (const g of h.plants) {
    const c = cal(g.cropId, g.zoneId);
    if (!c) continue;
    for (const a of activitiesIn(c, month)) {
      items.push({
        activity: a, cropId: g.cropId, zoneId: g.zoneId, subjects: [g.id], suggestion: false,
        ...(a === "Flowering" && c.lateFrost.includes(month) && { lateFrost: true }),
      });
    }
  }
  return items;
}
