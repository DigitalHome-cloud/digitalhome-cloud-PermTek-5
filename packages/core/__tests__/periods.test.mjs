import assert from "node:assert/strict";
import { test } from "node:test";

import {
  checkHabitat, checkPeriod, defaultPeriods, emptyHabitat, freeMonths, habitatFromTtl, habitatToTtl, monthsOf, newGuild, newPeriod,
  periodAt, periodCells, periodCrops, periodFits, planFromSets,
} from "../dist/index.js";

// docs/adr/0029: a bed's year in growing and rest periods, each growing period with its own target.

// a generic temperate year (not a site): mean °C, rain mm, sun kWh/m² a day
const MEAN = [2.5, 3.5, 7, 10.5, 14.5, 17.5, 19.5, 19, 15.5, 11, 6.5, 3.5];
const MONTHS = MEAN.map((m, i) => ({ month: i + 1, minC: m - 4, meanC: m, maxC: m + 4, rainMm: 60, sunKwhM2: 3, windMs: 3 }));
const ZONE = { id: "https://permtek-5.digitalhome.cloud/id/zone-z", name: "Roof", kind: "RoofZone", exposure: [] };

function bedHabitat() {
  const { guild, bed } = newGuild(ZONE, "Guild", "Bed");
  return { ...emptyHabitat(), zones: [ZONE], guilds: [guild], beds: [bed] };
}

test("a period's months run over New Year when it ends before it starts", () => {
  assert.deepEqual(monthsOf({ fromMonth: 4, toMonth: 9 }), [4, 5, 6, 7, 8, 9]);
  assert.deepEqual(monthsOf({ fromMonth: 11, toMonth: 2 }), [11, 12, 1, 2]);
  assert.deepEqual(monthsOf({ fromMonth: 5, toMonth: 5 }), [5]);
});

test("the default year: growing April to September, rest October to March; every month is in one period", () => {
  const h = bedHabitat(), bed = h.beds[0];
  const periods = defaultPeriods(bed, { growing: "Summer", rest: "Winter" });
  const withP = { ...h, periods };
  assert.deepEqual(checkHabitat(withP), []);
  assert.equal(periodAt(withP, bed.id, 6).kind, "GrowingKind");
  assert.equal(periodAt(withP, bed.id, 1).kind, "RestKind");
  assert.deepEqual(freeMonths(withP, bed.id), []);
});

test("a bed's periods may not overlap, and a cell's period is its own bed's", () => {
  const h = bedHabitat(), bed = h.beds[0];
  const a = newPeriod(bed, "Spring", "GrowingKind", 3, 6), b = newPeriod(bed, "Summer", "GrowingKind", 6, 9);
  assert.equal(periodFits({ ...h, periods: [a] }, b), false);
  assert.deepEqual(checkHabitat({ ...h, periods: [a, b] }).map((p) => p.code), ["periodsOverlap"]);
  const stray = { id: "https://permtek-5.digitalhome.cloud/id/cell-x", bedId: bed.id, row: 0, col: 0, cropId: "crop-lettuce", status: "CellPlanned", periodId: "https://permtek-5.digitalhome.cloud/id/period-none" };
  assert.deepEqual(checkHabitat({ ...h, periods: [a], cells: [stray] }).map((p) => p.code), ["noPeriod"]);
});

test("each period has its own target; the same cell may be used in two periods", async () => {
  const h = bedHabitat(), bed = h.beds[0];
  const spring = newPeriod(bed, "Spring", "GrowingKind", 3, 6, [{ setId: "set-salad-bed", share: 1 }]);
  const summer = newPeriod(bed, "Summer", "GrowingKind", 7, 10, [{ setId: "set-kitchen-herbs", share: 1 }]);
  const plan = (p) => planFromSets(bed, p.sets, [], { seed: 5 }).cells.map((c, i) => ({ ...c, id: `${p.id}/c${i}`, bedId: bed.id, status: "CellPlanned", periodId: p.id }));
  const cells = [...plan(spring), ...plan(summer)];
  const withP = { ...h, periods: [spring, summer], cells };
  assert.deepEqual(checkHabitat(withP), [], "a cell planted in spring and in summer is not twice");
  assert.ok(periodCells(withP, bed.id, spring.id).every((c) => periodCrops(spring).includes(c.cropId)));
  assert.equal(periodCells(withP, bed.id).length, 0, "no cells outside a period");

  const back = habitatFromTtl(await habitatToTtl(withP));
  const byId = (xs) => [...xs].sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(byId(back.periods), byId(withP.periods));
  assert.deepEqual(back.cells.map((c) => c.periodId).sort(), cells.map((c) => c.periodId).sort());
});

test("an old map's cells, without a period, load as the bed as it stands", async () => {
  const h = bedHabitat(), bed = h.beds[0];
  const cell = { id: "https://permtek-5.digitalhome.cloud/id/cell-old", bedId: bed.id, row: 1, col: 1, cropId: "crop-lettuce", status: "CellSown" };
  const back = habitatFromTtl(await habitatToTtl({ ...h, cells: [cell] }));
  assert.equal(back.periods, undefined);
  assert.deepEqual(periodCells(back, bed.id), [cell]);
});

test("the calendar warns about crops that do not fit a period", () => {
  const bed = bedHabitat().beds[0];
  const winter = newPeriod(bed, "Winter", "GrowingKind", 10, 3, [{ setId: "set-tomato-friends", share: 1 }]);
  const warned = checkPeriod(winter, ["crop-tomato"], MONTHS);
  assert.equal(warned[0]?.why, "noSow", "no tomato goes in between October and March");
  const summer = newPeriod(bed, "Summer", "GrowingKind", 5, 9);
  assert.deepEqual(checkPeriod(summer, ["crop-lettuce"], MONTHS), [], "lettuce sown in May is ready in time");
  const short = newPeriod(bed, "Early summer", "GrowingKind", 6, 7);
  assert.equal(checkPeriod(short, ["crop-tomato"], MONTHS)[0]?.why, "notReady");
  assert.deepEqual(checkPeriod(winter, ["crop-tomato"], null), [], "without a climate there is nothing to say");
  assert.deepEqual(checkPeriod({ ...winter, kind: "RestKind" }, ["crop-tomato"], MONTHS), []);
});
