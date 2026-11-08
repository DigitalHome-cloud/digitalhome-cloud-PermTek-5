import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

import { WORMBED5_WATER, checkHabitat, defaultWater, habitatFromTtl, habitatToTtl, newGuild, rainLitres, removeZone, useMmPerDay, waterBudget, zoneContents } from "../dist/index.js";

// docs/adr/0025: a guild's water, rain caught and stored, worm liquid kept apart from clean water.
const DEMO = fs.readFileSync(new URL("../../ontology/abox/examples/citydemo-habitat.ttl", import.meta.url), "utf8");
const NAMES = { roof: "Roof", barrel: "Rain barrel", pipes: "Tank pipes", sump: "Sump", bin: "Worm box bin", garden: "Garden tank", mist: "Mist line",
  barrelTap: "Barrel tap", sumpBed: "Sump to bed", sumpGarden: "Sump to garden" };
// a generic temperate year (not a site): mean °C, rain mm, sun kWh/m² a day
const MEAN = [2.5, 3.5, 7, 10.5, 14.5, 17.5, 19.5, 19, 15.5, 11, 6.5, 3.5];
const RAIN = [60, 50, 55, 50, 65, 70, 75, 70, 60, 65, 65, 65];
const SUN = [0.8, 1.5, 2.6, 3.9, 4.8, 5.2, 5.2, 4.5, 3.2, 1.9, 1.0, 0.6];
const MONTHS = MEAN.map((m, i) => ({ month: i + 1, minC: m - 4, meanC: m, maxC: m + 4, rainMm: RAIN[i], sunKwhM2: SUN[i], windMs: 3 }));

test("CityDemo's guild has its water: roof, barrel, tank pipes, sump, the box's bin, garden tank and four valves; it round-trips", async () => {
  const h = habitatFromTtl(DEMO);
  assert.deepEqual(h.stores.map((s) => s.kind).sort(), ["GardenTank", "RainBarrel", "TankPipes", "WormBoxBin", "WormBoxSump"]);
  assert.equal(h.valves.length, 4);
  const mist = h.valves.find((v) => h.stores.find((s) => s.id === v.to)?.kind === "WormBoxBin");
  assert.equal(h.stores.find((s) => s.id === mist.from).kind, "RainBarrel", "the mist line waters the box from the barrel");
  assert.equal(h.catchments[0].storeId, h.stores.find((s) => s.kind === "RainBarrel").id);
  assert.ok(h.stores.find((s) => s.kind === "GardenTank").zoneId.endsWith("zone-z-citygarden"), "the garden tank stands in the garden");
  assert.deepEqual(checkHabitat(h), []);
  assert.deepEqual(habitatFromTtl(await habitatToTtl(h)), h);
});

test("a new WormBed5 gets the default water, sized from its bed", () => {
  const zone = { id: "https://permtek-5.digitalhome.cloud/id/zone-z-1", name: "Roof", kind: "RoofZone", exposure: [] };
  const { guild, bed } = newGuild(zone, "Guild", "Bed");
  const w = defaultWater(guild, { ...bed, widthCm: 120, tankPipes: 8, tankPipeMm: 110 }, NAMES);
  const sump = w.stores.find((s) => s.kind === "WormBoxSump");
  assert.equal(sump.capacityL, 14, "the sump: 40 cm x 120 cm x 3 cm");
  assert.ok(w.stores.find((s) => s.kind === "TankPipes").capacityL > 150);
  assert.equal(w.catchments[0].m2, WORMBED5_WATER.catchmentM2);
  assert.deepEqual(w.valves.map((v) => v.kind), ["EdgeValve", "EdgeValve", "EdgeValve", "EdgeValve"], "the barrel's tap and the mist line are the edge's too");
  assert.equal(w.stores.find((s) => s.kind === "WormBoxBin").capacityL, undefined, "the bin stores nothing");
  const h = { zones: [zone], guilds: [guild], beds: [bed], cells: [], plants: [], rest: "", ...w };
  assert.deepEqual(checkHabitat(h), []);
});

test("worm liquid into the clean barrel, or a valve to nowhere, is a problem", () => {
  const h = habitatFromTtl(DEMO);
  const sump = h.stores.find((s) => s.kind === "WormBoxSump"), barrel = h.stores.find((s) => s.kind === "RainBarrel");
  const wrong = { ...h, valves: [...h.valves, { id: "x:v", name: "wrong", guildId: h.guilds[0].id, from: sump.id, to: barrel.id, kind: "EdgeValve" },
    { id: "x:w", name: "nowhere", guildId: h.guilds[0].id, from: sump.id, to: "x:none", kind: "EdgeValve" }] };
  assert.deepEqual(checkHabitat(wrong).map((p) => p.code).sort(), ["valveEnds", "wormIntoClean"]);
});

test("rain in litres: mm times m² times the runoff share", () => {
  const l = rainLitres({ id: "x", name: "r", guildId: "g", m2: 8, runoff: 0.8, storeId: "s" }, MONTHS);
  assert.equal(l[6], Math.round(75 * 8 * 0.8));
  assert.equal(rainLitres({ id: "x", name: "r", guildId: "g", m2: 8, storeId: "s" }, [])[0], null, "no climate: no number");
});

test("the plants' use follows warmth and sun: a few mm a day in summer, little in winter", () => {
  const july = useMmPerDay(MONTHS[6]), jan = useMmPerDay(MONTHS[0]);
  assert.ok(july > 3 && july < 5, `July ${july}`);
  assert.ok(jan < 1, `January ${jan}`);
});

test("CityDemo's water budget: rain covers part of the summer need, all of the winter's; H7's range", () => {
  const h = habitatFromTtl(DEMO);
  const b = waterBudget(h, h.guilds[0].id, MONTHS);
  const july = b.months[6], jan = b.months[0];
  assert.ok(july.needL > july.rainOnBedL, "in July the bed needs more than falls on it");
  assert.ok(july.usedL > 0 && july.usedL <= july.caughtL, "the barrel makes up some of it");
  assert.equal(jan.rainSharePct, 100);
  assert.ok(b.seasonSharePct >= 30 && b.seasonSharePct <= 100, `April-September share ${b.seasonSharePct} %: within H7's 30-100`);
  assert.equal(waterBudget(h, h.guilds[0].id, []).seasonSharePct, null, "no climate: no share");
});

test("removing an area takes what is in it; a garden tank of a guild elsewhere stays, in its guild's area (ADR 0028)", () => {
  const h = habitatFromTtl(DEMO);
  const garden = h.zones.find((z) => z.id.endsWith("zone-z-citygarden")), roof = h.zones.find((z) => z.id.endsWith("zone-z-cityroof"));
  const inGarden = zoneContents(h, garden.id);
  assert.equal(inGarden.plants, 3, "the three fruit trees");
  assert.equal(inGarden.guilds.size + inGarden.beds.size + inGarden.water, 0, "the guild, its bed and its water are on the roof");
  const noGarden = removeZone(h, garden.id);
  assert.deepEqual(noGarden.zones.map((z) => z.id), [roof.id]);
  assert.equal(noGarden.plants.length, 0);
  assert.equal(noGarden.stores.length, h.stores.length);
  assert.equal(noGarden.stores.find((s) => s.kind === "GardenTank").zoneId, undefined);
  assert.deepEqual(checkHabitat(noGarden), []);

  const inRoof = zoneContents(h, roof.id);
  assert.ok(inRoof.guilds.size === 1 && inRoof.beds.size === 1 && inRoof.cells > 0 && inRoof.water === h.stores.length + h.catchments.length + h.valves.length);
  const noRoof = removeZone(h, roof.id);
  assert.equal(noRoof.guilds.length + noRoof.beds.length + noRoof.cells.length + noRoof.stores.length + noRoof.valves.length + noRoof.catchments.length, 0);
  assert.equal(noRoof.cycles?.length ?? 0, 0);
  assert.deepEqual(checkHabitat(noRoof), []);
});
