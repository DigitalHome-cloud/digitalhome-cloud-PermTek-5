import assert from "node:assert/strict";
import { test } from "node:test";

import { climateMonths, cropById, cropSeasons, deriveWindows, footprint, standingIn, yearPlan } from "../dist/index.js";

// docs/adr/0022: a year in the bed. An invented mild lowland climate.
const LOW = [1, 1.5, 3, 5.5, 9, 12.5, 14, 14, 11.5, 9, 5, 2.5];
const months = climateMonths({ monthly: { min: LOW, mean: LOW.map((x) => x + 3.5), max: LOW.map((x) => x + 7.5) } });
const bed = { id: "b", name: "b", zoneId: "z", lengthCm: 300, widthCm: 120, cellCm: 10, wormBinCm: 40 };
const WANT = ["crop-carrot", "crop-chives", "crop-onion", "crop-rocket", "crop-garlic", "crop-sweet-pepper", "crop-cucumber",
  "crop-lettuce", "crop-radish", "crop-spinach", "crop-bush-bean", "crop-marigold", "crop-pear"];
const by = (list) => Object.fromEntries(list.map((c) => [c.cropId, c]));

test("in October a cucumber waits for June and starts under cover; lettuce can go in now; a tree never", () => {
  const s = by(cropSeasons(WANT, months, 0, 10));
  assert.deepEqual([s["crop-cucumber"].how, s["crop-cucumber"].from], ["PlantOut", 6]);
  assert.equal(by(cropSeasons(["crop-cucumber"], months, 1, 10))["crop-cucumber"].from, 5, "a roof, a degree warmer: a month earlier");
  assert.ok(s["crop-cucumber"].startIndoors < 6 && s["crop-cucumber"].startIndoorsOffset < s["crop-cucumber"].fromOffset);
  assert.deepEqual([s["crop-lettuce"].how, s["crop-lettuce"].fromOffset], ["SowOutdoors", 0]);
  assert.equal(s["crop-pear"].why, "tree");
  assert.equal(by(cropSeasons(["crop-black-pepper"], months, 0, 10))["crop-black-pepper"].why, "noWindow");
  assert.equal(by(cropSeasons(["crop-lettuce"], null, 0, 10))["crop-lettuce"].why, "noClimate");
  // a colder place: later
  assert.ok(by(cropSeasons(["crop-cucumber"], months, -3, 1))["crop-cucumber"].from >= 6);
});

test("the year from March: each crop goes in in a month of its calendar, and no two plants share a cell at the same time", () => {
  const plan = yearPlan(bed, WANT, months, 0, 3);
  assert.equal(plan.months.length, 12);
  assert.deepEqual(plan.months.map((m) => m.month), [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2]);
  for (const p of plan.plantings) {
    const cal = deriveWindows(months, cropById(p.cropId), 0);
    assert.ok((p.how === "PlantOut" ? cal.plantOut : cal.sowOutdoors).includes(p.from), `${p.cropId} ${p.how} in month ${p.from}`);
    assert.ok(p.toOffset >= p.fromOffset && p.toOffset <= 11);
  }
  for (let k = 0; k < 12; k++) {
    const taken = new Set();
    for (const p of standingIn(plan, k)) {
      const f = footprint(p.cropId, bed), r0 = p.row - Math.floor((f - 1) / 2), c0 = p.col - Math.floor((f - 1) / 2);
      for (let r = r0; r < r0 + f; r++) for (let c = c0; c < c0 + f; c++) {
        assert.ok(r >= 0 && r < 12 && c >= 0 && c < 26 && !taken.has(`${r}|${c}`), `month +${k}: ${p.cropId} at ${p.row},${p.col}`);
        taken.add(`${r}|${c}`);
      }
    }
  }
  const s = by(plan.crops);
  assert.ok(s["crop-sweet-pepper"].plants >= 1 && s["crop-cucumber"].plants >= 1, "the big late crops have their place kept");
  assert.equal(s["crop-pear"].why, "tree");
  assert.deepEqual(yearPlan(bed, WANT, months, 0, 3).plantings, plan.plantings, "the same input, the same year");
});

test("when a crop is cleared, quick crops follow it: a succession, and the bed is not left bare in summer", () => {
  const plan = yearPlan(bed, WANT, months, 0, 3);
  const catches = plan.plantings.filter((p) => p.catchCrop);
  assert.ok(catches.length > 20 && catches.every((p) => ["crop-radish", "crop-rocket", "crop-lettuce", "crop-spinach"].includes(p.cropId)));
  assert.ok(catches.some((p) => p.fromOffset >= 3), "sown again later in the year");
  const june = plan.months.find((m) => m.month === 6), march = plan.months[0];
  assert.ok(june.cover >= 0.8, `June cover ${june.cover}`);
  assert.ok(Object.keys(march.sow).length >= 4 && Object.keys(march.plantOut).length === 0, "March: sowing, nothing tender out yet");
  assert.ok(plan.months.find((m) => m.month === 6).plantOut["crop-cucumber"] >= 1);
  assert.ok(plan.months.some((m) => m.startIndoors.includes("crop-cucumber")));
  const perCrop = {};
  for (const p of catches) perCrop[`${p.cropId}|${p.fromOffset}`] = (perCrop[`${p.cropId}|${p.fromOffset}`] ?? 0) + 1;
  assert.ok(Math.max(...Object.values(perCrop)) <= 40, "no hundred rockets in one sowing");
});

test("what stands in the bed already is planted around, and without a climate there is no year", () => {
  const here = [{ id: "c1", bedId: "b", row: 5, col: 5, cropId: "crop-chives", status: "CellGrowing" }];
  const plan = yearPlan(bed, WANT, months, 0, 3, here);
  for (let k = 0; k < 12; k++) {
    assert.ok(!standingIn(plan, k).some((p) => Math.abs(p.row - 5) <= 1 && Math.abs(p.col - 5) <= 1 && footprint(p.cropId, bed) === 1 && p.row === 5 && p.col === 5));
  }
  assert.ok(plan.months.every((m) => m.cover > 0));
  const none = yearPlan(bed, WANT, null, 0, 3);
  assert.deepEqual([none.plantings, none.months], [[], []]);
  assert.ok(none.crops.every((c) => c.why));
});

test("a cover crop in the bed gives way to the crops; one that a recipe wants does not", async () => {
  const { givesWay } = await import("../dist/index.js");
  assert.equal(givesWay("crop-white-clover", WANT), true);
  assert.equal(givesWay("crop-white-mustard", [...WANT, "crop-white-mustard"]), false);
  assert.equal(givesWay("crop-lettuce", WANT), false);
  const clover = [];
  for (let row = 0; row < 12; row++) for (let col = 0; col < 26; col++) clover.push({ id: `k${row}-${col}`, bedId: "b", row, col, cropId: "crop-white-clover", status: "CellGrowing" });
  const plan = yearPlan(bed, WANT, months, 0, 3, clover);
  assert.ok(plan.plantings.length > 50, "a bed full of clover is still planted");
});
