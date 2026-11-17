import assert from "node:assert/strict";
import { test } from "node:test";

import {
  checkHabitat, crowdedCells, emptyHabitat, farmLayout, footprint, habitatFromTtl, habitatToTtl, layerOf, newFarm,
  planFromSets, plantSets, plantingConflict, suggestPlanting,
} from "../dist/index.js";

const bed = (o = {}) => ({ id: "b", name: "b", zoneId: "z", lengthCm: 300, widthCm: 100, cellCm: 10, wormBinCm: 40, ...o });
const cell = (row, col, cropId, id = `c${row}-${col}-${cropId}`) => ({ id, bedId: "b", row, col, cropId, status: "CellPlanned" });

// docs/adr/0027: plant sets, layers, and planting by hand without collisions.

test("the library's plant sets name library crops, in EN, DE and FR", () => {
  const sets = plantSets();
  assert.ok(sets.length >= 6);
  const herbs = sets.find((s) => s.id === "set-kitchen-herbs");
  assert.deepEqual(Object.keys(herbs.names).sort(), ["de", "en", "fr"]);
  assert.ok(herbs.members.some((m) => m.cropId === "crop-rosemary"));
});

test("layers: a tall upright crop, a low ground cover, and the rest in the middle", () => {
  assert.equal(layerOf("crop-tomato"), "tall");
  assert.equal(layerOf("crop-thyme"), "ground");
  assert.equal(layerOf("crop-cucumber"), "ground");
  assert.equal(layerOf("crop-lettuce"), "mid");
  assert.equal(layerOf("crop-courgette"), "mid", "it covers the soil, but is too big to go under anything");
});

/** Every pair of placed plants: no two blocks of the same layer, and no non-tall/ground pair, overlap. */
function overlaps(b, cells) {
  const block = (c) => { const f = footprint(c.cropId, b), h = Math.floor((f - 1) / 2); return [c.row - h, c.col - h, c.row - h + f - 1, c.col - h + f - 1]; };
  const out = [];
  for (let i = 0; i < cells.length; i++) for (let j = i + 1; j < cells.length; j++) {
    const [a, c] = [cells[i], cells[j]];
    const la = layerOf(a.cropId), lc = layerOf(c.cropId);
    if ((la === "tall" && lc === "ground") || (la === "ground" && lc === "tall")) continue;
    const [r0, c0, r1, c1] = block(a), [s0, d0, s1, d1] = block(c);
    if (r0 <= s1 && s0 <= r1 && c0 <= d1 && d0 <= c1) out.push([a, c]);
  }
  return out;
}

test("planning from sets: big plants first, nothing collides, the same seed gives the same bed", () => {
  const b = bed();
  const plan = planFromSets(b, [{ setId: "set-kitchen-herbs", share: 1 }, { setId: "set-tomato-friends", share: 2 }]);
  assert.ok(plan.cells.length > 10);
  assert.deepEqual(overlaps(b, plan.cells), []);
  assert.ok(plan.cells.some((c) => c.cropId === "crop-tomato") && plan.cells.some((c) => c.cropId === "crop-rosemary"),
    "the biggest plants got their room");
  assert.equal(plan.sets.length, 2);
  assert.ok(plan.sets[1].crops.every((c) => c.placed > 0 || c.why), "a crop that did not fit says why");
  const again = planFromSets(b, [{ setId: "set-kitchen-herbs", share: 1 }, { setId: "set-tomato-friends", share: 2 }]);
  assert.deepEqual(again.cells, plan.cells);
});

test("thyme may grow under a tomato, lettuce may not", () => {
  const b = bed({ wormBinCm: 0, lengthCm: 50, widthCm: 50 });             // one tomato's room: 5 x 5 cells
  const plan = suggestPlanting(b, { "crop-tomato": 1, "crop-thyme": 1 });
  assert.equal(plan.cells.length, 2, "both fit: the thyme under the tomato");
  const crowded = suggestPlanting(b, { "crop-tomato": 1, "crop-lettuce": 1 });
  assert.equal(crowded.cells.filter((c) => c.cropId === "crop-lettuce").length, 0);
});

test("planting by hand: a plant inside another's spacing is refused, a ground cover under a tall one is not", () => {
  const b = bed();
  const cells = [cell(5, 10, "crop-tomato")];
  assert.equal(plantingConflict(b, cells, 6, 11, "crop-lettuce")?.cropId, "crop-tomato");
  assert.equal(plantingConflict(b, cells, 6, 11, "crop-thyme"), undefined);
  assert.equal(plantingConflict(b, cells, 5, 20, "crop-lettuce"), undefined, "far enough away");
  assert.equal(plantingConflict(b, cells, 5, 10, "crop-basil", "c5-10-crop-tomato"), undefined, "the cell being replaced does not count");
  const crowded = crowdedCells(b, [...cells, cell(6, 11, "crop-lettuce")]);
  assert.equal(crowded.size, 2);
});

test("checkHabitat: a ground cover may share a tall plant's cell, two upright plants may not", () => {
  const h = { ...emptyHabitat(), zones: [{ id: "z", name: "Roof", kind: "RoofZone", exposure: [] }], beds: [bed()],
    cells: [cell(5, 10, "crop-tomato"), cell(5, 10, "crop-thyme")] };
  assert.deepEqual(checkHabitat(h), []);
  h.cells.push(cell(5, 10, "crop-basil"));
  assert.deepEqual(checkHabitat(h).map((p) => p.code), ["cellTwice"]);
});

test("a farm of beds: its beds, their layout, its limit, and the round trip with a plant set of the space", async () => {
  const zone = { id: "https://permtek-5.digitalhome.cloud/id/zone-z", name: "Field", kind: "GroundZone", exposure: [] };
  const { farm, beds } = newFarm(zone, "Field beds", 2, 3, { lengthCm: 500, widthCm: 120, cellCm: 10, pathCm: 50 });
  assert.equal(beds.length, 6);
  const at = farmLayout(farm, beds);
  assert.deepEqual([at[1].xCm, at[3].yCm], [550, 170]);
  const own = { id: "https://permtek-5.digitalhome.cloud/id/set-shade", names: { en: "Shady herbs" }, for: ["RectangleBedSurface"],
    members: [{ cropId: "crop-parsley", share: 2 }, { cropId: "crop-chives", share: 1 }], draft: true };
  const h = { ...emptyHabitat(), zones: [zone], farms: [farm], beds, plantSets: [own] };
  assert.deepEqual(checkHabitat(h), []);
  const back = habitatFromTtl(await habitatToTtl(h));
  assert.deepEqual(back.farms, [farm]);
  assert.equal(back.beds.filter((x) => x.farmId === farm.id).length, 6);
  assert.deepEqual(back.plantSets, [own]);
  assert.equal(back.rest, "");
  assert.deepEqual(checkHabitat({ ...h, farms: [{ ...farm, rows: 10, perRow: 10 }] }).map((p) => p.code), ["farmTooBig"]);
  const plan = planFromSets(beds[0], [{ setId: own.id, share: 1 }], [], {}, [own]);
  assert.ok(plan.cells.some((c) => c.cropId === "crop-parsley"));
});

test("a farm shares its sets out by share: at least a bed each, two sets a bed when beds are few", async () => {
  const { shareOut, planFarm } = await import("../dist/index.js");
  const ids = ["b1", "b2", "b3", "b4", "b5", "b6"];
  const out = shareOut(ids, [{ setId: "set-salad-bed", share: 3 }, { setId: "set-kitchen-herbs", share: 1 }, { setId: "set-roots-and-onions", share: 2 }]);
  const count = (id) => [...out.values()].filter((c) => c.some((x) => x.setId === id)).length;
  assert.deepEqual([count("set-salad-bed"), count("set-roots-and-onions"), count("set-kitchen-herbs")], [3, 2, 1]);
  const few = shareOut(["b1", "b2"], [{ setId: "a", share: 1 }, { setId: "b", share: 1 }, { setId: "c", share: 1 }]);
  assert.deepEqual([...few.values()].map((c) => c.length), [2, 1]);
  const beds = ids.slice(0, 2).map((id) => ({ ...bed({ wormBinCm: 0 }), id }));
  const plans = planFarm(beds, [{ setId: "set-salad-bed", share: 1 }, { setId: "set-kitchen-herbs", share: 1 }]);
  assert.ok(plans.every((p) => p.plan.cells.length > 0));
});
