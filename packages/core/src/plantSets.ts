/**
 * Plant sets (docs/adr/0027): crops planned together, such as "Kitchen herbs", each with its share of the room.
 *
 * The library's sets come from packages/ontology/abox/library/plantsets.ttl (tools/export_library.py writes
 * plantSets.generated.ts). A space may keep its own sets in its graph (Habitat.plantSets), among them drafts
 * proposed by the edge's agent; a draft joins the library only by review.
 *
 * planFromSets() in planting.ts turns sets into a bed.
 */
import { PLANT_SETS } from "./plantSets.generated.js";

export type SurfaceCategory = "RectangleBedSurface" | "BedFarmSurface" | "GreenhouseSurface" | "FoodForestSurface";
/** The categories there is a planner for; greenhouses and food forests come later. */
export const PLANNED_SURFACES: SurfaceCategory[] = ["RectangleBedSurface", "BedFarmSurface"];

export interface SetMember { cropId: string; share: number }

export interface PlantSet {
  /** Local id ("set-kitchen-herbs") for the library's sets; a full IRI for a space's own. */
  id: string;
  names: { en?: string; de?: string; fr?: string };
  about?: string;
  for: string[];
  members: SetMember[];
  /** Proposed and not yet reviewed (a person's or the edge agent's). */
  draft?: boolean;
}

export const plantSets = (): PlantSet[] => PLANT_SETS;

/** A set by id, among the library's and the space's own. */
export const plantSetById = (id: string, own: PlantSet[] = []): PlantSet | undefined =>
  own.find((s) => s.id === id) ?? PLANT_SETS.find((s) => s.id === id);

export const setName = (s: PlantSet, lang: string): string =>
  (s.names as Record<string, string | undefined>)[lang] ?? s.names.en ?? s.id;
