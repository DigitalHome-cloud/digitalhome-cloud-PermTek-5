/**
 * The shared crop library, as the app uses it.
 *
 * The source is packages/ontology/abox/library/crops.ttl; tools/export_library.py
 * writes library.generated.ts from it (its test fails on drift). Names are in
 * English, French, German and Latin.
 */
import { LIBRARY } from "./library.generated.js";

export type Activity =
  | "SowIndoors" | "SowOutdoors" | "PlantOut" | "Harvest" | "SaveSeed"
  | "Flowering" | "WinterPrune" | "SummerPrune";

export interface CropNeeds {
  /** Sow outdoors once the monthly mean reaches this (°C). */
  sowMinTempC?: number;
  /** Frost-tender crops: plant out once the mean daily minimum reaches this (°C). */
  plantOutMinNightC?: number;
  /** Do not sow when the mean daily maximum is above this: it bolts (°C). */
  boltAboveC?: number;
  frostTender?: boolean;
  daysToHarvest?: number;
  spacingCm?: number;
}

export interface TypicalWindow { activity: string; from: number; to: number; part?: string }

export interface LibraryCrop {
  /** Local id, e.g. "crop-lettuce"; the IRI is CROP_IRI + id. */
  id: string;
  names: { en?: string; fr?: string; de?: string; la?: string };
  lifeCycle: string | null;
  growthForm: string | null;
  parts: string[];
  needs: CropNeeds;
  windows: TypicalWindow[];
}

export const CROP_IRI = "https://permaculture.digitalhome.cloud/id/";

export const crops = (): LibraryCrop[] => LIBRARY;

const BY_ID = new Map(LIBRARY.map((c) => [c.id, c]));
export const cropById = (id: string): LibraryCrop | undefined => BY_ID.get(id);

/** The crop's name in a language, falling back to English, then Latin. */
export const cropName = (crop: LibraryCrop, lang: string): string =>
  (crop.names as Record<string, string | undefined>)[lang] ?? crop.names.en ?? crop.names.la ?? crop.id;

export const isWoody = (crop: LibraryCrop) => crop.growthForm === "Tree" || crop.growthForm === "Shrub";

/** The months from..to, running over the new year when to < from (11..2 = Nov, Dec, Jan, Feb). */
export function monthSpan(from: number, to: number): number[] {
  const out: number[] = [];
  for (let m = from; ; m = (m % 12) + 1) {
    out.push(m);
    if (m === to || out.length === 12) return out;
  }
}
