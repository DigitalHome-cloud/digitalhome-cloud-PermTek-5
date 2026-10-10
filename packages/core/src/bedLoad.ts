/**
 * How heavy a growing bed is when wet (docs/specs/roofbed-system.md).
 *
 * An ESTIMATE from typical densities and from the pipes' geometry, to compare
 * designs and to hand to whoever judges the roof. It is not a structural
 * calculation: what a roof may carry is in the building's documents or with a
 * structural engineer, never here.
 *
 * The bed, bottom to top: a tank layer as high as the pipes (the pipes full of
 * water, the gaps between them packed with substrate, which is the wick), then
 * the substrate the plants root in. A worm box takes the bed's far end; the
 * pipes run under it too, to catch its liquid.
 */
import type { Bed, SubstrateKind } from "./habitatModel.js";

/** Saturated density, kg/m³: the weight after rain, which is what a roof has to carry. */
export const SATURATED_DENSITY: Record<SubstrateKind, number> = {
  LightweightRoofSubstrate: 1100,
  PottingCompost: 900,
  GardenSoil: 1800,
};
export const DEFAULT_SUBSTRATE: SubstrateKind = "LightweightRoofSubstrate";
export const DEFAULT_DEPTH_CM = 15;
/** A pipe's bore is a little under its outer diameter (wall about 3 % each side). */
const BORE = 0.94;
/** The worm box: bedding, food and castings, moist; this high, this full. */
const WORM_BIN_HEIGHT_M = 0.35;
const WORM_BIN_FILL = 0.7;
const WORM_BIN_DENSITY = 800;
/** Frame boards (30 mm softwood) and a liner. */
const BOARD_M = 0.03;
const WOOD_DENSITY = 500;
const LINER_KG_M2 = 1.5;
/** The gantry over the bed: rails, bridge, motors, tools. */
export const GANTRY_KG = 40;

export interface BedLoad {
  /** Footprint on the roof, m². */
  areaM2: number;
  substrateKg: number;
  /** Water the tank pipes hold when full, litres (= kg). */
  tankLitres: number;
  wormBinKg: number;
  frameKg: number;
  gantryKg: number;
  totalKg: number;
  kgPerM2: number;
  kNPerM2: number;
}

const round = (x: number) => Math.round(x);

export function bedLoad(bed: Bed, withGantry = true): BedLoad {
  const length = bed.lengthCm / 100, width = bed.widthCm / 100;
  const depth = (bed.depthCm ?? DEFAULT_DEPTH_CM) / 100;
  const density = SATURATED_DENSITY[bed.substrate ?? DEFAULT_SUBSTRATE];
  const bin = Math.min(length, (bed.wormBinCm ?? 0) / 100);
  const pipes = bed.tankPipes ?? 0;
  const pipeD = pipes > 0 ? (bed.tankPipeMm ?? 110) / 1000 : 0;
  const area = length * width;

  const pipeOuter = Math.PI * (pipeD / 2) ** 2 * length * pipes;                 // m³
  const tankLitres = Math.PI * ((pipeD * BORE) / 2) ** 2 * length * pipes * 1000;
  const wick = Math.max(0, area * pipeD - pipeOuter);                            // substrate between the pipes
  const rooted = (length - bin) * width * depth;
  const substrateKg = (rooted + wick) * density;
  const wormBinKg = bin * width * WORM_BIN_HEIGHT_M * WORM_BIN_FILL * WORM_BIN_DENSITY;
  const frameKg = 2 * (length + width) * (depth + pipeD + 0.03) * BOARD_M * WOOD_DENSITY + area * LINER_KG_M2;
  const gantryKg = withGantry ? GANTRY_KG : 0;
  const totalKg = substrateKg + tankLitres + wormBinKg + frameKg + gantryKg;
  return {
    areaM2: Math.round(area * 100) / 100,
    substrateKg: round(substrateKg), tankLitres: round(tankLitres), wormBinKg: round(wormBinKg),
    frameKg: round(frameKg), gantryKg, totalKg: round(totalKg),
    kgPerM2: round(totalKg / area), kNPerM2: Math.round((totalKg / area) * 9.81 / 10) / 100,
  };
}

/**
 * Where a load stands against what roofs are OFTEN built for. Only a way to
 * read the number: "light" is what many flat roofs not meant to be walked on
 * allow on top of their own weight, "terrace" what roofs built for people
 * usually allow. A real roof may be either side of both.
 */
export const LIGHT_ROOF_KG_M2 = 100;
export const TERRACE_KG_M2 = 300;
export type LoadClass = "light" | "terrace" | "heavy";
export const loadClass = (kgPerM2: number): LoadClass =>
  kgPerM2 <= LIGHT_ROOF_KG_M2 ? "light" : kgPerM2 <= TERRACE_KG_M2 ? "terrace" : "heavy";
