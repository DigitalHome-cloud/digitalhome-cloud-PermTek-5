/**
 * A habitat's places and plants (docs/adr/0016): zones, growing beds split
 * into cells, and long-lived garden plants such as fruit trees. Stored as the
 * shared space's A-Box (habitatGraph.ts); checked here for what SHACL cannot
 * say, e.g. that a cell lies inside its bed.
 */
import { mintId } from "./identity.js";
import { cropById } from "./library.js";

export const HABITAT_IRI = "https://permtek-5.digitalhome.cloud/id/";

export type ZoneKind = "RoofZone" | "GroundZone" | "BalconyZone" | "GreenhouseZone";
export type Exposure = "FullSun" | "HalfShade" | "Shade" | "Windy";
export type CellStatus = "CellPlanned" | "CellSown" | "CellGrowing" | "CellHarvested";

export const ZONE_KINDS: ZoneKind[] = ["RoofZone", "GroundZone", "BalconyZone", "GreenhouseZone"];
export const EXPOSURES: Exposure[] = ["FullSun", "HalfShade", "Shade", "Windy"];
export const CELL_STATUSES: CellStatus[] = ["CellPlanned", "CellSown", "CellGrowing", "CellHarvested"];

/** Ids are full IRIs in the app's id space, minted (ADR-0003). */
export interface Zone { id: string; name: string; kind: ZoneKind; exposure: Exposure[]; areaM2?: number; offsetC?: number }
export interface Bed { id: string; name: string; zoneId: string; lengthCm: number; widthCm: number; depthCm?: number; cellCm: number }
export interface Cell { id: string; bedId: string; row: number; col: number; cropId: string; status: CellStatus; sownOn?: string }
export interface GardenPlant {
  id: string; name: string; zoneId: string; cropId: string;
  plantedYear?: number; rootstock?: string; xM?: number; yM?: number;
}

export interface Habitat {
  zones: Zone[];
  beds: Bed[];
  cells: Cell[];
  plants: GardenPlant[];
  /** Triples about anything else in the graph, as N-Triples: kept as they are on every save. */
  rest: string;
}

export const emptyHabitat = (): Habitat => ({ zones: [], beds: [], cells: [], plants: [], rest: "" });

export const newId = (kind: "zone" | "bed" | "cell" | "plant") =>
  `${HABITAT_IRI}${kind}-${mintId(kind[0])}`;

/** A roof is about a degree warmer than the street; elsewhere start at 0. */
export const defaultOffset = (kind: ZoneKind) => (kind === "RoofZone" ? 1 : kind === "GreenhouseZone" ? 3 : 0);

/** Rows run across the width, columns along the length. */
export const bedGrid = (b: Bed) => ({ rows: Math.ceil(b.widthCm / b.cellCm), cols: Math.ceil(b.lengthCm / b.cellCm) });

/** How many cells (per side) one plant of the crop covers in this bed. */
export function footprint(cropId: string, b: Bed): number {
  const spacing = cropById(cropId)?.needs.spacingCm;
  return spacing ? Math.max(1, Math.round(spacing / b.cellCm)) : 1;
}

export const zoneOffset = (h: Habitat, zoneId: string) => h.zones.find((z) => z.id === zoneId)?.offsetC ?? 0;

export interface Problem { code: "cellOutside" | "cellTwice" | "noZone" | "noBed" | "unknownCrop"; id: string }

/** What SHACL cannot check, reported all at once. */
export function checkHabitat(h: Habitat): Problem[] {
  const problems: Problem[] = [];
  const zones = new Set(h.zones.map((z) => z.id));
  const beds = new Map(h.beds.map((b) => [b.id, b]));
  for (const b of h.beds) if (!zones.has(b.zoneId)) problems.push({ code: "noZone", id: b.id });
  for (const p of h.plants) {
    if (!zones.has(p.zoneId)) problems.push({ code: "noZone", id: p.id });
    if (!cropById(p.cropId)) problems.push({ code: "unknownCrop", id: p.id });
  }
  const seen = new Set<string>();
  for (const c of h.cells) {
    const b = beds.get(c.bedId);
    if (!b) { problems.push({ code: "noBed", id: c.id }); continue; }
    const { rows, cols } = bedGrid(b);
    if (c.row < 0 || c.col < 0 || c.row >= rows || c.col >= cols) problems.push({ code: "cellOutside", id: c.id });
    const key = `${c.bedId}|${c.row}|${c.col}`;
    if (seen.has(key)) problems.push({ code: "cellTwice", id: c.id });
    seen.add(key);
    if (!cropById(c.cropId)) problems.push({ code: "unknownCrop", id: c.id });
  }
  return problems;
}
