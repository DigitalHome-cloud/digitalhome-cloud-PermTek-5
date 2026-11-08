import assert from "node:assert/strict";
import { test } from "node:test";

import { areaOfHomeId, climateMonths, frostFreeMonths, goldPath, portalUrl } from "../dist/index.js";

// docs/adr/0015: a habitat's area and climate follow from its DHC home.

test("a minted home id carries its area; other ids do not", () => {
  assert.equal(areaOfHomeId("DE-80331-MAR12-01"), "DE-80331");
  assert.equal(areaOfHomeId(" be-1000-rue1-01 "), "BE-1000");
  for (const id of ["BE-DEMO", "", "DE-80331", "t-aaaaaaaaaa"]) assert.equal(areaOfHomeId(id), null, id);
});

test("gold paths are the core pipeline's layout", () => {
  assert.equal(goldPath("BE-1000", "climate"), "public/weather/gold/BE-1000/all/climate.json");
  assert.equal(goldPath("BE-1000", "solar", "5y"), "public/weather/gold/BE-1000/5y/solar.json");
});

// Invented normals, roughly a temperate lowland town.
const min = [1, 1.5, 3, 5, 9, 12, 14, 13.5, 11, 7.5, 4, 1.5];
const climate = {
  monthly: { min, mean: min.map((x) => x + 3), max: min.map((x) => x + 6) },
  rain: { monthly_mm: Array(12).fill(60) },
};

test("twelve months, frost marked by the mean daily minimum", () => {
  const ms = climateMonths(climate, { monthly: { ghi: Array(12).fill(2) } }, null);
  assert.equal(ms.length, 12);
  assert.deepEqual(ms[0], { month: 1, minC: 1, meanC: 4, maxC: 7, rainMm: 60, sunKwhM2: 2, windMs: null, frost: false, frostRisk: true });
  assert.equal(ms[6].frostRisk, false);
  assert.deepEqual(frostFreeMonths(ms), { from: 4, to: 10 });
});

test("gaps in the gold stay gaps, never zeros", () => {
  const ms = climateMonths({ monthly: { min: [Number.NaN], mean: [], max: [] } });
  assert.equal(ms[0].minC, null);
  assert.equal(ms[0].frostRisk, false);
  assert.equal(frostFreeMonths(ms), null);
});

test("the Portal of the same environment", () => {
  assert.equal(portalUrl("main"), "https://portal.digitalhome.cloud");
  assert.equal(portalUrl("stage"), "https://stage-portal.digitalhome.cloud");
  assert.equal(portalUrl("sandbox"), "http://localhost:8000");
});
