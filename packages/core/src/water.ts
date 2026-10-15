/**
 * A guild's water (docs/adr/0025): rain caught on a roof, stores (a rain barrel, the bed's tank pipes, the worm
 * box's sump, a garden tank, and the worm box's bin that a mist line waters) and the valves between them. Worm liquid and clean water are kept apart: worm liquid
 * never flows into a store kept for clean water (the shapes say the same, packages/ontology).
 *
 *   defaultWater(guild, bed)     the parts a WormBed5 has when nothing else is said
 *   rainLitres(catchment, m)     litres a catchment brings each month, from the area's rain
 *   waterBudget(h, guild, m)     each month: what the bed needs, the rain on it, what the barrel adds, what is lost
 *
 * Pure functions over plain data.
 */
import { bedLoad, sumpLitres } from "./bedLoad.js";
import type { ClimateMonth } from "./habitat.js";
import { newId, type Bed, type Guild, type Habitat, type RainCatchment, type Valve, type WaterStore } from "./habitatModel.js";

/** What a WormBed5's water starts with (docs/specs/roofbed-system.md §5): a stretch of roof, a barrel, a garden tank. */
export const WORMBED5_WATER = { catchmentM2: 8, runoff: 0.8, barrelL: 200, gardenTankL: 300 } as const;
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/**
 * The water parts a WormBed5 guild has: the roof's rain into a barrel whose tap refills the tank pipes, a mist
 * line from the barrel under the worm box's lid (it waters the bedding with the box closed, ADR 0025), and the
 * worm box's sump with a valve to the tank pipes and one to a garden tank (which stands in the guild's area until
 * someone moves it). The barrel's two valves are the edge's: it proposes them, a person confirms. Names come in
 * the caller's language.
 */
export function defaultWater(guild: Guild, bed: Bed, names: Record<"roof" | "barrel" | "pipes" | "sump" | "bin" | "garden" | "barrelTap" | "mist" | "sumpBed" | "sumpGarden", string>): {
  catchments: RainCatchment[]; stores: WaterStore[]; valves: Valve[];
} {
  const g = guild.id;
  const barrel: WaterStore = { id: newId("store"), name: names.barrel, guildId: g, kind: "RainBarrel", capacityL: WORMBED5_WATER.barrelL, holds: ["CleanWater"] };
  const pipes: WaterStore = { id: newId("store"), name: names.pipes, guildId: g, kind: "TankPipes",
    capacityL: Math.round(bedLoad(bed).tankLitres), holds: ["CleanWater", "WormLiquid"] };
  const sump: WaterStore = { id: newId("store"), name: names.sump, guildId: g, kind: "WormBoxSump", capacityL: sumpLitres(bed), holds: ["WormLiquid"] };
  const bin: WaterStore = { id: newId("store"), name: names.bin, guildId: g, kind: "WormBoxBin", holds: ["CleanWater"] };
  const garden: WaterStore = { id: newId("store"), name: names.garden, guildId: g, kind: "GardenTank",
    capacityL: WORMBED5_WATER.gardenTankL, holds: ["CleanWater", "WormLiquid"] };
  return {
    catchments: [{ id: newId("rain"), name: names.roof, guildId: g, m2: WORMBED5_WATER.catchmentM2, runoff: WORMBED5_WATER.runoff, storeId: barrel.id }],
    stores: [barrel, pipes, sump, bin, garden],
    valves: [
      { id: newId("valve"), name: names.barrelTap, guildId: g, from: barrel.id, to: pipes.id, kind: "EdgeValve" },
      { id: newId("valve"), name: names.mist, guildId: g, from: barrel.id, to: bin.id, kind: "EdgeValve" },
      { id: newId("valve"), name: names.sumpBed, guildId: g, from: sump.id, to: pipes.id, kind: "EdgeValve" },
      { id: newId("valve"), name: names.sumpGarden, guildId: g, from: sump.id, to: garden.id, kind: "EdgeValve" },
    ],
  };
}

/** Litres a catchment brings each month (1 mm on 1 m² is a litre), from the area's rain; null where a month has none. */
export function rainLitres(c: RainCatchment, months: ClimateMonth[]): (number | null)[] {
  return Array.from({ length: 12 }, (_, i) => {
    const mm = months.find((m) => m.month === i + 1)?.rainMm;
    return mm == null ? null : Math.round(mm * c.m2 * (c.runoff ?? 0.8));
  });
}

/**
 * What the bed's plants use in a day, mm, from the month's warmth and sun: the Hargreaves form of the reference
 * evapotranspiration, 0.0135 × (T + 17.8) × Rs, with the sun's energy as mm of water evaporated (1 kWh/m² ≈ 1.47 mm).
 * A rule of thumb for a sunny bed of mixed vegetables; null without the month's climate.
 */
export function useMmPerDay(m: ClimateMonth | undefined): number | null {
  if (!m || m.meanC == null || m.sunKwhM2 == null) return null;
  return Math.max(0, 0.0135 * (m.meanC + 17.8) * m.sunKwhM2 * 3.6 / 2.45);
}

export interface WaterMonth {
  month: number;
  /** what the planted part of the bed uses */
  needL: number | null;
  /** rain that falls on the bed itself */
  rainOnBedL: number | null;
  /** rain the catchments send to the barrel */
  caughtL: number | null;
  /** of that, what can reach the bed: no more than it still needs, nor than the barrel and tank pipes hold */
  usedL: number | null;
  /** what overflows from barrel and tank */
  lostL: number | null;
  /** how many times the caught rain would fill the tank pipes */
  refills: number | null;
  /** share of the need that rain covers, % */
  rainSharePct: number | null;
}

/**
 * The guild's water month by month: the need of its planted bed, the rain on the bed, the rain the catchments catch,
 * and how much of the need rain covers. A month is one store-full at most: what the barrel and the tank pipes cannot
 * hold is lost to the overflow. The starter hypothesis H7 is the April-September share (`seasonShare`).
 */
export function waterBudget(h: Habitat, guildId: string, months: ClimateMonth[]): { months: WaterMonth[]; seasonSharePct: number | null } {
  const bed = h.beds.find((b) => b.guildId === guildId);
  const stores = (h.stores ?? []).filter((s) => s.guildId === guildId);
  const catchments = (h.catchments ?? []).filter((c) => c.guildId === guildId);
  const barrelL = stores.filter((s) => s.kind === "RainBarrel").reduce((a, s) => a + (s.capacityL ?? 0), 0);
  const pipesL = stores.filter((s) => s.kind === "TankPipes").reduce((a, s) => a + (s.capacityL ?? 0), 0);
  const plantedM2 = bed ? Math.max(0, bed.lengthCm - (bed.wormBinCm ?? 0)) / 100 * (bed.widthCm / 100) : 0;
  const rows: WaterMonth[] = Array.from({ length: 12 }, (_, i) => {
    const m = months.find((x) => x.month === i + 1);
    const use = useMmPerDay(m);
    const needL = use == null ? null : Math.round(use * DAYS[i] * plantedM2);
    const rainOnBedL = m?.rainMm == null ? null : Math.round(m.rainMm * plantedM2);
    const caught = catchments.map((c) => rainLitres(c, months)[i]);
    const caughtL = caught.some((x) => x == null) ? null : caught.reduce<number>((a, x) => a + (x ?? 0), 0);
    if (needL == null || rainOnBedL == null || caughtL == null) {
      return { month: i + 1, needL, rainOnBedL, caughtL, usedL: null, lostL: null, refills: null, rainSharePct: null };
    }
    const stillNeeded = Math.max(0, needL - rainOnBedL);
    const usedL = Math.min(caughtL, stillNeeded, barrelL + pipesL);
    return {
      month: i + 1, needL, rainOnBedL, caughtL, usedL, lostL: Math.max(0, caughtL - usedL - barrelL),   // the barrel keeps the rest for later
      refills: pipesL > 0 ? Math.round((caughtL / pipesL) * 10) / 10 : null,
      rainSharePct: needL > 0 ? Math.round((Math.min(rainOnBedL, needL) + usedL) / needL * 100) : null,
    };
  });
  const season = rows.slice(3, 9);
  const need = season.reduce((a, r) => a + (r.needL ?? NaN), 0);
  const got = season.reduce((a, r) => a + (r.needL == null ? NaN : Math.min(r.rainOnBedL ?? 0, r.needL) + (r.usedL ?? 0)), 0);
  return { months: rows, seasonSharePct: Number.isFinite(need) && need > 0 ? Math.round(got / need * 100) : null };
}
