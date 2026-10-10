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
export type SubstrateKind = "LightweightRoofSubstrate" | "GardenSoil" | "PottingCompost";
export const SUBSTRATE_KINDS: SubstrateKind[] = ["LightweightRoofSubstrate", "GardenSoil", "PottingCompost"];

export interface Bed {
  id: string; name: string; zoneId: string; lengthCm: number; widthCm: number; depthCm?: number; cellCm: number;
  /** A wicking bed (docs/specs/roofbed-system.md): what the substrate is, the drain pipes under it that
   *  hold the water, and how much of the bed's far end a worm box takes. */
  substrate?: SubstrateKind; tankPipes?: number; tankPipeMm?: number; wormBinCm?: number;
}
export interface Cell {
  id: string; bedId: string; row: number; col: number; cropId: string; status: CellStatus; sownOn?: string;
  /** Only when this cell differs from the crop's sowing depth / seeds per point. */
  depthMm?: number; seeds?: number;
}
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

/** The columns at the bed's far end that the worm box takes: no cells there. */
export function wormBinCols(b: Bed): number {
  return b.wormBinCm ? Math.min(bedGrid(b).cols, Math.ceil(b.wormBinCm / b.cellCm)) : 0;
}

export const zoneOffset = (h: Habitat, zoneId: string) => h.zones.find((z) => z.id === zoneId)?.offsetC ?? 0;

export interface Problem { code: "cellOutside" | "cellTwice" | "cellInBin" | "noZone" | "noBed" | "unknownCrop"; id: string }

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
    else if (c.col >= cols - wormBinCols(b)) problems.push({ code: "cellInBin", id: c.id });
    const key = `${c.bedId}|${c.row}|${c.col}`;
    if (seen.has(key)) problems.push({ code: "cellTwice", id: c.id });
    seen.add(key);
    if (!cropById(c.cropId)) problems.push({ code: "unknownCrop", id: c.id });
  }
  return problems;
}

/**
 * What a seeder (a person, or the gantry of ADR 0017) does at one cell.
 * Bed coordinates in mm: the origin is the outer corner of row 0 / column 0,
 * x runs along the bed's length (columns), y across its width (rows); the
 * point is the cell's centre. Depth is below the substrate surface.
 */
export interface SowingJob {
  cellId: string; bedId: string; cropId: string;
  xMm: number; yMm: number; depthMm: number; seeds: number;
  /** Keep this clear around the point (the crop's spacing). */
  spacingMm: number;
  /** When to look whether it came up (days after sowing). */
  checkAfterDays: number | null;
}

export function sowingJob(h: Habitat, cell: Cell): SowingJob | null {
  const bed = h.beds.find((b) => b.id === cell.bedId);
  const crop = cropById(cell.cropId);
  if (!bed || !crop) return null;
  const cellMm = bed.cellCm * 10;
  return {
    cellId: cell.id, bedId: bed.id, cropId: crop.id,
    xMm: Math.round((cell.col + 0.5) * cellMm),
    yMm: Math.round((cell.row + 0.5) * cellMm),
    depthMm: cell.depthMm ?? crop.needs.sowingDepthMm ?? 5,
    seeds: cell.seeds ?? crop.needs.seedsPerPoint ?? 1,
    spacingMm: (crop.needs.spacingCm ?? bed.cellCm) * 10,
    checkAfterDays: crop.needs.germinationDays ?? null,
  };
}
