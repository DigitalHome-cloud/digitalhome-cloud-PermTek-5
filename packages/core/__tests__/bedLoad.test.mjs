import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

import { bedLoad, checkHabitat, guildForBed, habitatFromTtl, habitatToTtl, loadClass, sumpLitres, wormBinCols } from "../dist/index.js";

// docs/specs/roofbed-system.md: how heavy a wet bed is. Estimates, to compare designs.
const bed = (o = {}) => ({ id: "b", name: "b", zoneId: "z", lengthCm: 300, widthCm: 100, cellCm: 10, ...o });
export const VARIANTS = [
  ["10 cm, no tank", { depthCm: 10 }],
  ["15 cm, no tank, worm box", { depthCm: 15, wormBinCm: 40 }],
  ["15 cm, 14 × 50 mm pipes, worm box", { depthCm: 15, tankPipes: 14, tankPipeMm: 50, wormBinCm: 40 }],
  ["15 cm, 10 × 75 mm pipes, worm box", { depthCm: 15, tankPipes: 10, tankPipeMm: 75, wormBinCm: 40 }],
  ["15 cm, 6 × 110 mm pipes, worm box", { depthCm: 15, tankPipes: 6, tankPipeMm: 110, wormBinCm: 40 }],
  ["25 cm, 6 × 110 mm pipes, worm box", { depthCm: 25, tankPipes: 6, tankPipeMm: 110, wormBinCm: 40 }],
  ["35 cm, 6 × 110 mm pipes, worm box", { depthCm: 35, tankPipes: 6, tankPipeMm: 110, wormBinCm: 40 }],
];
const table = () => {
  const rows = ["| Bed, 3 × 1 m | Tank | Lightweight roof substrate | Garden soil |", "|---|---|---|---|"];
  for (const [name, o] of VARIANTS) {
    const light = bedLoad(bed({ ...o, substrate: "LightweightRoofSubstrate" }));
    const soil = bedLoad(bed({ ...o, substrate: "GardenSoil" }));
    rows.push(`| ${name} | ${light.tankLitres} l | ${light.totalKg} kg · ${light.kgPerM2} kg/m² | ${soil.totalKg} kg · ${soil.kgPerM2} kg/m² |`);
  }
  return rows.join("\n");
};

test("the reference beds: a plain 15 cm bed, and the same as a wicking bed", () => {
  const plain = bedLoad(bed({ depthCm: 15, wormBinCm: 40 }));
  assert.deepEqual([plain.totalKg, plain.kgPerM2, plain.tankLitres], [574, 191, 0]);
  const wicking = bedLoad(bed({ depthCm: 15, tankPipes: 10, tankPipeMm: 75, wormBinCm: 40 }));
  assert.deepEqual([wicking.totalKg, wicking.kgPerM2, wicking.tankLitres, wicking.kNPerM2], [802, 267, 117, 2.62]);
  assert.ok(Math.abs(wicking.substrateKg + wicking.tankLitres + wicking.wormBinKg + wicking.frameKg + wicking.gantryKg - wicking.totalKg) <= 2);
  assert.equal(bedLoad(bed({ depthCm: 15 }), false).gantryKg, 0);
});

test("depth, density and the tank layer's HEIGHT make it heavier; more pipes do not", () => {
  const load = (o) => bedLoad(bed(o));
  assert.ok(load({ depthCm: 25 }).totalKg > load({ depthCm: 15 }).totalKg);
  assert.ok(load({ depthCm: 15, substrate: "GardenSoil" }).totalKg > load({ depthCm: 15 }).totalKg);
  assert.ok(load({ depthCm: 15, tankPipes: 3, tankPipeMm: 110 }).totalKg > load({ depthCm: 15, tankPipes: 3, tankPipeMm: 75 }).totalKg);
  // Water is lighter than wet substrate: a layer packed with pipes holds more and weighs no more.
  const few = load({ depthCm: 15, tankPipes: 3, tankPipeMm: 75 }), packed = load({ depthCm: 15, tankPipes: 10, tankPipeMm: 75 });
  assert.ok(packed.tankLitres > 3 * few.tankLitres && packed.totalKg <= few.totalKg);
  // and a thin tank layer costs far more than the water it holds
  assert.ok(few.totalKg - load({ depthCm: 15 }).totalKg > 3 * few.tankLitres);
});

test("how the number reads against what roofs are often built for", () => {
  assert.equal(loadClass(90), "light");
  assert.equal(loadClass(191), "terrace");
  assert.equal(loadClass(267), "terrace");
  assert.equal(loadClass(310), "heavy");
  for (const [, o] of VARIANTS) assert.notEqual(loadClass(bedLoad(bed(o)).kgPerM2), "light", "no soil bed here is light");
});

test("the document's weight table is the calculator's", () => {
  const doc = fs.readFileSync(new URL("../../../docs/specs/roofbed-system.md", import.meta.url), "utf8");
  const m = /<!-- weights:start[^>]*-->\n([\s\S]*?)\n<!-- weights:end -->/.exec(doc);
  assert.ok(m, "the document has a weights block");
  assert.equal(m[1].trim(), table(), "update the table in docs/specs/roofbed-system.md:\n" + table());
});

const DEMO = fs.readFileSync(new URL("../../ontology/abox/examples/citydemo-habitat.ttl", import.meta.url), "utf8");

test("the worm box takes the bed's last columns, and nothing is planted there", async () => {
  const h = habitatFromTtl(DEMO);
  const b = h.beds[0];
  assert.deepEqual([b.substrate, b.tankPipes, b.tankPipeMm, b.wormBinCm, b.depthCm], ["LightweightRoofSubstrate", 8, 110, 40, 15]);
  assert.equal(wormBinCols(b), 4);
  assert.deepEqual(checkHabitat(h), []);
  assert.deepEqual(habitatFromTtl(await habitatToTtl(h)), h, "the new fields survive a round trip");
  h.cells.push({ ...h.cells[0], id: "x", row: 0, col: 26 });
  assert.deepEqual(checkHabitat(h).map((p) => p.code), ["cellInBin"]);
  assert.equal(wormBinCols({ ...b, wormBinCm: undefined }), 0);
});

test("the worm box is two bins: the upper one's contents and a full sump", () => {
  const b = bed({ depthCm: 15, wormBinCm: 40 });
  assert.equal(sumpLitres(b), 12);                      // 0.4 m x 1 m x 3 cm
  const load = bedLoad(b);
  assert.equal(load.sumpLitres, 12);
  assert.equal(load.wormBinKg, 79);                     // 0.4 x 1 x 0.30 m, 70 % full, 800 kg/m³, plus the sump
  assert.equal(sumpLitres(bed({ depthCm: 15 })), 0);
});

test("an existing bed becomes a WormBed5 guild with the parts that type has; what the map says is kept", () => {
  const zone = { id: "z", name: "Roof", kind: "RoofZone", exposure: [] };
  const plain = bed({ depthCm: 25 });
  const made = guildForBed(plain, zone, "Roof guild");
  assert.equal(made.guild.type, "WormBed5");
  assert.deepEqual([made.bed.guildId, made.bed.wormBinCm, made.bed.tankPipes, made.bed.tankPipeMm, made.bed.depthCm],
    [made.guild.id, 40, 8, 110, 25]);
  assert.deepEqual(checkHabitat({ zones: [zone], guilds: [made.guild], beds: [made.bed], cells: [], plants: [] }), []);
  const own = guildForBed(bed({ wormBinCm: 60, tankPipes: 6, tankPipeMm: 75 }), zone, "g").bed;
  assert.deepEqual([own.wormBinCm, own.tankPipes, own.tankPipeMm], [60, 6, 75]);
  const planted = guildForBed(plain, zone, "g", [{ id: "c", bedId: "b", row: 0, col: 28, cropId: "crop-lettuce", status: "CellPlanned" }]).bed;
  assert.equal(planted.wormBinCm, undefined, "no box over a planted cell");
});
