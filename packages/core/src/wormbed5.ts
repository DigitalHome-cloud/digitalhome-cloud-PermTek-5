/**
 * A WormBed5, guided (docs/adr/0028): the sizes the Gantry5-gen1 works, what each substrate depth grows, and the
 * worm box sized by the household that feeds it, not typed in freely. A farm of WormBed5 is beds of one size, each
 * its own guild.
 */
import { cropById } from "./library.js";
import { GUILD_ROBOT, WORMBED5, bedGrid, newFarm, newId, wormBinCols } from "./habitatModel.js";
import type { Bed, BedFarm, Guild, Zone } from "./habitatModel.js";

/** The sizes offered (docs/specs/roofbed-robot.md: about 3 × 1 m, 10 cm cells; roofbed-system.md: depths). */
export const WORMBED5_SIZES = {
  lengthsCm: [200, 250, 300, 350, 400],
  widthsCm: [80, 100, 120],
  depthsCm: [15, 25, 35],
  cellCm: 10,
  pathsCm: [50, 60, 80, 100],
} as const;

/** What a substrate depth grows (docs/specs/roofbed-system.md §2); each deeper one grows the shallower ones' too. */
const DEPTH_CROPS: Record<number, string[]> = {
  15: ["crop-lettuce", "crop-rocket", "crop-radish", "crop-spinach", "crop-spring-onion", "crop-chives", "crop-parsley"],
  25: ["crop-swiss-chard", "crop-basil"],
  35: ["crop-tomato", "crop-courgette", "crop-aubergine", "crop-sweet-pepper"],
};
const ROOT_DEPTH: Record<string, number> = { ShallowRoot: 15, MediumRoot: 25, DeepRoot: 35 };

/** The least substrate a crop wants, cm: the spec's table first, else by its roots; undefined when unknown. */
export function minDepthCm(cropId: string): number | undefined {
  for (const [d, ids] of Object.entries(DEPTH_CROPS)) if (ids.includes(cropId)) return Number(d);
  const roots = cropById(cropId)?.mix?.rootDepth;
  return roots ? ROOT_DEPTH[roots] : undefined;
}

/**
 * The worm box (docs/specs/wormbed5-sizing.md): 0.48 m² turns over ~90 kg of scraps a year (H1), a person gives
 * ~35 kg of suitable scraps (H6), so ~0.19 m² per person. At least 30 cm (a smaller box loses its warmth), at most
 * a quarter of the bed's length.
 */
export const WORM_BOX = { kgPerM2Year: 90 / 0.48, kgPerPersonYear: 35, minCm: 30, maxShare: 0.25, castingsPerKg: 0.22, bedKgPerM2: 1.6 } as const;

/** The worm box's length along the bed, cm, for the scraps of `people`. */
export function wormBoxCm(people: number, widthCm: number, lengthCm: number): number {
  const m2 = (people * WORM_BOX.kgPerPersonYear) / WORM_BOX.kgPerM2Year;
  const cm = Math.ceil((m2 / (widthCm / 100)) * 10) * 10;
  const max = Math.floor((lengthCm * WORM_BOX.maxShare) / 10) * 10;
  return Math.max(WORM_BOX.minCm, Math.min(max, cm));
}

/** What a bed's worm box does in a year: scraps it takes, people that feeds on, castings, and what the bed itself uses. */
export function wormBoxYear(b: Bed): { scrapsKg: number; people: number; castingsKg: number; bedUsesKg: number } {
  const boxM2 = ((b.wormBinCm ?? 0) / 100) * (b.widthCm / 100);
  const scrapsKg = Math.round(boxM2 * WORM_BOX.kgPerM2Year);
  const { rows, cols } = bedGrid(b);
  const plantM2 = (rows * (cols - wormBinCols(b)) * b.cellCm * b.cellCm) / 10000;
  return {
    scrapsKg,
    people: Math.round((scrapsKg / WORM_BOX.kgPerPersonYear) * 10) / 10,
    castingsKg: Math.round(scrapsKg * WORM_BOX.castingsPerKg),
    bedUsesKg: Math.round(plantM2 * WORM_BOX.bedKgPerM2),
  };
}

export interface WormBedSize { lengthCm: number; widthCm: number; depthCm: number; wormBinCm: number; tank: boolean }

/** A WormBed5's parts for a size: tank pipes (the reference's) or none. */
export const wormBedParts = (s: WormBedSize): Partial<Bed> =>
  ({ depthCm: s.depthCm, wormBinCm: s.wormBinCm, tankPipes: s.tank ? WORMBED5.tankPipes : 0, ...(s.tank && { tankPipeMm: WORMBED5.tankPipeMm }) });

/** A farm of WormBed5 (docs/adr/0028): `rows` × `perRow` beds of one size, paths between, each bed its own guild. */
export function newWormBedFarm(zone: Zone, name: string, rows: number, perRow: number, size: WormBedSize & { pathCm: number }):
  { farm: BedFarm; guilds: Guild[]; beds: Bed[] } {
  const made = newFarm(zone, name, rows, perRow, { lengthCm: size.lengthCm, widthCm: size.widthCm, cellCm: WORMBED5_SIZES.cellCm, pathCm: size.pathCm });
  const guilds: Guild[] = [];
  const beds = made.beds.map((b) => {
    const guild: Guild = { id: newId("guild"), name: b.name, zoneId: zone.id, type: "WormBed5", robot: GUILD_ROBOT.WormBed5, wormsMayLeave: true };
    guilds.push(guild);
    return { ...b, guildId: guild.id, ...wormBedParts(size) };
  });
  return { farm: made.farm, guilds, beds };
}
