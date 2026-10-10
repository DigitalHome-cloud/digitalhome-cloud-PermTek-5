import assert from "node:assert/strict";
import { test } from "node:test";

import {
  cropById, cropsWanted, footprint, matchCrop, parseIngredients, plantCounts, scorePlanting, sharedRecipes, suggestPlanting,
} from "../dist/index.js";

const bed = (o = {}) => ({ id: "b", name: "b", zoneId: "z", lengthCm: 300, widthCm: 100, cellCm: 10, wormBinCm: 40, ...o });
const cell = (row, col, cropId) => ({ id: `c${row}-${col}`, bedId: "b", row, col, cropId, status: "CellPlanned" });

// docs/adr/0021: recipes say what is wanted; the bed is planted mixed.

test("a pasted list of ingredients becomes lines, linked to crops where one is named", () => {
  const lines = parseIngredients(`INGRÉDIENTS (pour deux burgers) :
- 3 carottes
- 1 œuf
- Ciboulette fraîche
- Oignon rouge
- Roquette

Pour la viande :
- Ail en poudre
- Paprika fumé
- Sel & poivre
- Cornichons en morceaux`);
  const by = Object.fromEntries(lines.map((l) => [l.text, l]));
  assert.equal(lines.length, 9, "headings and blank lines are dropped");
  assert.deepEqual([by["3 carottes"].cropId, by["3 carottes"].part, by["3 carottes"].methods], ["crop-carrot", "Root", ["Fresh"]]);
  assert.equal(by["Ciboulette fraîche"].cropId, "crop-chives");
  assert.equal(by["Oignon rouge"].cropId, "crop-onion");
  assert.equal(by["Roquette"].cropId, "crop-rocket");
  assert.deepEqual([by["Ail en poudre"].cropId, by["Ail en poudre"].methods], ["crop-garlic", ["Dried"]]);
  assert.deepEqual([by["Paprika fumé"].cropId, by["Paprika fumé"].methods], ["crop-sweet-pepper", ["Dried"]]);
  assert.deepEqual([by["Cornichons en morceaux"].cropId, by["Cornichons en morceaux"].methods], ["crop-cucumber", ["Pickled"]]);
  assert.equal(by["1 œuf"].cropId, undefined, "what is bought stays a line of text");
  assert.equal(by["Sel & poivre"].cropId, undefined);
  assert.equal(matchCrop("2 Möhren")?.id, "crop-carrot");
  assert.equal(matchCrop("a handful of rocket")?.id, "crop-rocket");
  assert.equal(matchCrop("ciboule")?.id, "crop-spring-onion", "not chives: the longer name wins");
});

test("the shared recipes say which crops they want", () => {
  const recipes = sharedRecipes();
  assert.equal(recipes.length, 12);
  const burger = recipes.find((r) => r.id === "recipe-burger-aux-carottes");
  const wanted = cropsWanted([burger, recipes.find((r) => r.id === "recipe-salade-du-toit")]);
  assert.deepEqual(wanted.filter((w) => w.recipes === 2).map((w) => w.cropId), ["crop-chives", "crop-rocket"]);
  assert.ok(wanted.some((w) => w.cropId === "crop-carrot") && wanted.every((w) => cropById(w.cropId)));
});

test("every crop that fits gets a plant, and the room is shared by area, not by number", () => {
  const b = bed();
  const ids = ["crop-carrot", "crop-chives", "crop-onion", "crop-rocket", "crop-garlic", "crop-sweet-pepper", "crop-cucumber", "crop-pear"];
  const n = plantCounts(b, ids);
  assert.equal(n["crop-pear"], undefined, "a tree is not for a bed");
  assert.ok(Object.keys(n).length === 7 && Object.values(n).every((v) => v >= 1));
  assert.ok(n["crop-carrot"] > 5 * n["crop-cucumber"], "many small plants for one big one");
  const area = Object.entries(n).reduce((sum, [id, k]) => sum + k * footprint(id, b) ** 2, 0);
  assert.ok(area <= 0.9 * 26 * 10 && area >= 0.8 * 26 * 10, `fills about nine tenths of the free bed (${area} cells)`);
  const less = plantCounts(b, ids, [cell(2, 2, "crop-courgette")]);
  assert.ok(Object.values(less).reduce((a, k) => a + k, 0) < Object.values(n).reduce((a, k) => a + k, 0), "what is planted already takes room");
  assert.ok(plantCounts(b, ids, [], { "crop-rocket": 3 })["crop-rocket"] > n["crop-rocket"], "a crop more recipes want gets more");
});

test("a mixed suggestion keeps every spacing, has good neighbours and no bad ones", () => {
  const b = bed();
  const ids = ["crop-carrot", "crop-chives", "crop-onion", "crop-rocket", "crop-garlic", "crop-sweet-pepper", "crop-cucumber", "crop-bush-bean", "crop-lettuce"];
  const s = suggestPlanting(b, plantCounts(b, ids));
  assert.ok(s.crops.every((c) => c.placed === c.wanted && !c.why), JSON.stringify(s.crops));
  // no two plants overlap, none leaves the soil or enters the worm box
  const taken = new Set();
  for (const p of s.cells) {
    const f = footprint(p.cropId, b), r0 = p.row - Math.floor((f - 1) / 2), c0 = p.col - Math.floor((f - 1) / 2);
    for (let r = r0; r < r0 + f; r++) for (let c = c0; c < c0 + f; c++) {
      assert.ok(r >= 0 && r < 10 && c >= 0 && c < 26, `${p.cropId} at ${p.row},${p.col} stays in the soil`);
      assert.ok(!taken.has(`${r}|${c}`), `${p.cropId} at ${p.row},${p.col} overlaps`);
      taken.add(`${r}|${c}`);
    }
  }
  assert.equal(s.badPairs, 0, JSON.stringify(s.pairs.bad));
  assert.ok(s.goodPairs >= 20, `good neighbours: ${s.goodPairs}`);
  assert.ok(s.cover > 0.8 && s.fedByBuilder >= 1, `cover ${s.cover}, heavy feeders with a bean beside them: ${s.fedByBuilder}`);
  assert.deepEqual(suggestPlanting(b, plantCounts(b, ids)).cells, s.cells, "the same input gives the same bed");
  assert.notDeepEqual(suggestPlanting(b, plantCounts(b, ids), [], { seed: 6 }).cells, s.cells, "another seed, another bed");
});

test("the same plants in blocks score worse than mixed, and the score says why", () => {
  const b = bed();
  const blocks = [];
  for (let col = 0; col < 8; col++) for (let row = 0; row < 3; row++) blocks.push(cell(row, col, "crop-carrot"));
  for (let col = 0; col < 8; col++) for (let row = 3; row < 6; row++) blocks.push(cell(row, col, "crop-radish"));
  for (let col = 8; col < 16; col += 2) for (let row = 0; row < 6; row += 2) blocks.push(cell(row, col, "crop-chives"));
  const asDrawn = scorePlanting(b, blocks);
  const wants = { "crop-carrot": 24, "crop-radish": 24, "crop-chives": 12 };
  const mixed = suggestPlanting(b, wants);
  assert.ok(asDrawn.sameCropPairs > 3 * mixed.sameCropPairs, `blocks: ${asDrawn.sameCropPairs} same-crop neighbours, mixed: ${mixed.sameCropPairs}`);
  assert.ok(mixed.score > asDrawn.score + 50 && mixed.goodPairs > asDrawn.goodPairs);
});

test("what is planted stays; tall crops take their side; trees and giants are named, not placed", () => {
  const b = bed();
  const here = [cell(5, 5, "crop-onion")];
  const s = suggestPlanting(b, { "crop-bush-bean": 6, "crop-tomato": 2, "crop-pear": 1, "crop-carrot": 8 }, here);
  assert.ok(!s.cells.some((p) => p.row === 5 && p.col === 5), "the onion keeps its cell");
  const beans = s.cells.filter((p) => p.cropId === "crop-bush-bean");
  assert.ok(beans.every((p) => Math.abs(p.row - 5) > 2 || Math.abs(p.col - 5) > 2), "beans are kept away from the onion");
  assert.ok(s.cells.filter((p) => p.cropId === "crop-tomato").every((p) => p.row <= 3), "tomatoes at the first rows");
  assert.equal(s.crops.find((c) => c.cropId === "crop-pear").why, "tree");
  const last = suggestPlanting(b, { "crop-tomato": 2 }, [], { tallSide: "last" });
  assert.ok(last.cells.every((p) => p.row >= 6));
  const small = suggestPlanting(bed({ lengthCm: 80, wormBinCm: 0 }), { "crop-courgette": 3 });
  assert.equal(small.crops[0].why === "noRoom" || small.crops[0].why === "tooBig", true);
});

test("a household's recipes are kept in its graph, line by line, beside everything else", async () => {
  const { habitatFromTtl, habitatToTtl, emptyHabitat, newId } = await import("../dist/index.js");
  const id = newId("recipe");
  assert.match(id, /^https:\/\/permtek-5\.digitalhome\.cloud\/id\/recipe-/);
  const recipe = {
    id, names: { fr: "Burger aux carottes" }, yield: "2 burgers", steps: ["Râper les carottes.", "Cuire."],
    lines: parseIngredients("3 carottes\n1 œuf\nail en poudre"),
  };
  const ttl = await habitatToTtl({ ...emptyHabitat(), recipes: [recipe], rest: "<https://permtek-5.digitalhome.cloud/id/x> <https://example.org/p> \"kept\" .\n" });
  assert.match(ttl, /schema:Recipe/);
  const back = habitatFromTtl(ttl);
  assert.deepEqual(back.recipes, [recipe]);
  assert.match(back.rest, /kept/);
  assert.ok(!/recipe-/.test(back.rest), "the recipe's triples are not counted as foreign");
  assert.equal(habitatFromTtl(await habitatToTtl(emptyHabitat())).recipes, undefined);
});

test("a cover crop takes every gap the plants leave: no bare soil", async () => {
  const { crops, habitatFromTtl, habitatToTtl, emptyHabitat } = await import("../dist/index.js");
  assert.deepEqual(crops().filter((c) => c.coverCrop).map((c) => c.id).sort(), ["crop-phacelia", "crop-white-clover", "crop-white-mustard"]);
  const b = bed();
  const wants = plantCounts(b, ["crop-carrot", "crop-onion", "crop-lettuce", "crop-bush-bean"]);
  const bare = suggestPlanting(b, wants), covered = suggestPlanting(b, wants, [], { cover: "crop-white-clover" });
  assert.ok(bare.cover < 0.95 && bare.coverCells === 0);
  assert.equal(covered.cover, 1);
  assert.equal(covered.coverCells, covered.cells.filter((p) => p.cropId === "crop-white-clover").length);
  assert.ok(covered.coverCells > 10);
  assert.deepEqual([covered.score, covered.goodPairs], [bare.score, bare.goodPairs], "the cover does not change what the crops are to each other");
  assert.deepEqual(covered.cells.filter((p) => p.cropId !== "crop-white-clover"), bare.cells);
  // and a bed says how thick its mulch is
  const h = { ...emptyHabitat(), zones: [{ id: "https://permtek-5.digitalhome.cloud/id/zone-z", name: "Roof", kind: "RoofZone", exposure: [] }],
    beds: [{ ...b, id: "https://permtek-5.digitalhome.cloud/id/bed-b", zoneId: "https://permtek-5.digitalhome.cloud/id/zone-z", mulchCm: 2 }] };
  assert.equal(habitatFromTtl(await habitatToTtl(h)).beds[0].mulchCm, 2);
});
