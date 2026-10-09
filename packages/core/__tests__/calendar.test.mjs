import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

import {
  checkHabitat, climateMonths, cropById, crops, deriveWindows, habitatFromTtl, habitatToTtl, isWoody, whatNow,
} from "../dist/index.js";

// docs/adr/0016: the calendar from an area's climate; the habitat's graph.
// Both climates are invented: a mild maritime lowland, and a cooler upland.
const climate = (min, shift = 0) => ({
  monthly: {
    min: min.map((x) => x + shift),
    mean: min.map((x) => x + shift + 3.5),
    max: min.map((x) => x + shift + 7.5),
  },
});
const LOWLAND = [1, 1.5, 3, 5.5, 9, 12.5, 14, 14, 11.5, 9, 5, 2.5];
const lowland = climateMonths(climate(LOWLAND));
const upland = climateMonths(climate(LOWLAND, -3));

test("lettuce is sown outdoors from early spring; tomatoes start under cover and go out later", () => {
  const lettuce = deriveWindows(lowland, cropById("crop-lettuce"));
  const tomato = deriveWindows(lowland, cropById("crop-tomato"));
  assert.equal(lettuce.basis, "derived");
  assert.ok(lettuce.sowOutdoors[0] <= 3, String(lettuce.sowOutdoors));
  assert.deepEqual(tomato.sowOutdoors, [], "a slow frost-tender crop is not sown outdoors");
  assert.ok(tomato.plantOut[0] > lettuce.sowOutdoors[0]);
  assert.deepEqual(tomato.sowIndoors, [tomato.plantOut[0] - 2, tomato.plantOut[0] - 1]);
  assert.ok(tomato.harvest[0] > tomato.plantOut[0]);
});

test("a cooler area starts later; a warmer zone (the roof) never later than the ground", () => {
  for (const crop of crops().filter((c) => !isWoody(c) && c.needs.sowMinTempC !== undefined)) {
    const ground = deriveWindows(lowland, crop, 0);
    const roof = deriveWindows(lowland, crop, 1);
    const cold = deriveWindows(upland, crop, 0);
    const first = (c) => [...c.sowOutdoors, ...c.plantOut].sort((a, b) => a - b)[0] ?? 13;
    assert.ok(first(roof) <= first(ground), `${crop.id}: roof ${first(roof)} > ground ${first(ground)}`);
    assert.ok(first(cold) >= first(ground), `${crop.id}: upland ${first(cold)} < lowland ${first(ground)}`);
  }
});

test("spinach is not sown in the warm months it would bolt in", () => {
  const hot = climateMonths(climate(LOWLAND, 2));
  const spinach = deriveWindows(hot, cropById("crop-spinach"));
  assert.ok(!spinach.sowOutdoors.includes(7) && !spinach.sowOutdoors.includes(8), String(spinach.sowOutdoors));
});

test("fruit trees: typical windows; stone fruit pruned in summer; late frost at flowering", () => {
  const plum = deriveWindows(lowland, cropById("crop-plum"));
  assert.equal(plum.basis, "typical");
  assert.deepEqual(plum.winterPrune, []);
  assert.deepEqual(plum.flowering, [3, 4]);
  assert.deepEqual(plum.lateFrost, [3], "March nights still freeze, April's do not");
  const pear = deriveWindows(climateMonths(climate(LOWLAND.map((x, i) => (i === 3 ? 3 : x)))), cropById("crop-pear"));
  assert.deepEqual(pear.lateFrost, [4], "a cold April night under the blossom");
  assert.deepEqual(deriveWindows(null, cropById("crop-pear")).lateFrost, [], "no climate, no warning");
});

test("without a climate, annuals have no derived calendar", () => {
  assert.equal(deriveWindows(null, cropById("crop-lettuce")).basis, "none");
});

const DEMO = fs.readFileSync(new URL("../../ontology/abox/examples/citydemo-habitat.ttl", import.meta.url), "utf8");

test("the CityDemo habitat reads, checks clean and survives a round trip", async () => {
  const h = habitatFromTtl(DEMO);
  assert.equal(h.zones.length, 2);
  assert.equal(h.beds[0].widthCm, 120);
  assert.equal(h.plants.length, 3);
  assert.ok(h.cells.length > 20);
  assert.deepEqual(checkHabitat(h), []);
  const again = habitatFromTtl(await habitatToTtl(h));
  assert.deepEqual(again, h);
});

test("triples the habitat does not know are kept on save", async () => {
  const extra = `<https://permtek-5.digitalhome.cloud/id/note-n1> <http://www.w3.org/2000/01/rdf-schema#comment> "from an edge" .`;
  const h = habitatFromTtl(DEMO + "\n" + extra);
  assert.match(await habitatToTtl(h), /from an edge/);
});

test("a cell outside its bed, or twice on one spot, is reported", () => {
  const h = habitatFromTtl(DEMO);
  const c = h.cells[0];
  h.cells.push({ ...c, id: c.id + "x" }, { ...c, id: c.id + "y", row: 12 });
  assert.deepEqual(checkHabitat(h).map((p) => p.code).sort(), ["cellOutside", "cellTwice"]);
});

test("what now: in May the sown radishes and growing lettuce are picked; in March the plum's blossom is at risk", () => {
  const h = habitatFromTtl(DEMO);
  const may = whatNow(h, lowland, 5);
  const did = (items, a, crop) => items.find((i) => i.activity === a && i.cropId === crop && !i.suggestion);
  assert.ok(did(may, "Harvest", "crop-radish"));
  assert.ok(did(may, "Harvest", "crop-lettuce"));
  assert.ok(may.some((i) => i.suggestion && i.cropId === "crop-spinach"), "the roof bed could take spinach");
  const march = whatNow(h, lowland, 3);
  assert.equal(did(march, "Flowering", "crop-plum")?.lateFrost, true);
});
