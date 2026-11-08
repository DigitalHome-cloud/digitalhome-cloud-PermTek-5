// npm test (backend): the bundled planner is packages/core's, and /edge/v1/plan answers from a space's graph.
import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";
// @ts-expect-error a plain .mjs script
import { bundle, dest } from "../../../scripts/sync-planner.mjs";
import { planForEdge } from "./plan";

const TTL = `@prefix perma: <https://permaculture.digitalhome.cloud/ontology#> . @prefix id: <https://permtek-5.digitalhome.cloud/id/> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
id:zone-z a perma:GardenZone ; rdfs:label "Roof" ; perma:zoneKind perma:RoofZone .
id:bed-b a perma:GrowingBed ; rdfs:label "Roof bed" ; perma:inZone id:zone-z ; perma:lengthCm 300 ; perma:widthCm 100 ; perma:cellSizeCm 10 ; perma:wormBinCm 40 .`;

test("the bundled planner matches packages/core", () => {
  assert.equal(fs.readFileSync(dest, "utf8"), bundle(), "run: node backend/scripts/sync-planner.mjs");
});

test("without sets it says what can be planned; with sets it proposes, and saves nothing", () => {
  const what = planForEdge(TTL, {});
  assert.equal(what.status, 200);
  assert.deepEqual((what.body.beds as { name: string }[]).map((b) => b.name), ["Roof bed"]);
  assert.ok((what.body.sets as { id: string }[]).some((s) => s.id === "set-kitchen-herbs"));
  const r = planForEdge(TTL, { bedId: "bed-b", sets: [{ setId: "set-kitchen-herbs", share: 1 }] });
  assert.equal(r.status, 200);
  const plans = r.body.plans as { cells: unknown[] }[];
  assert.equal(r.body.saved, false);
  assert.ok(plans[0].cells.length > 5);
  assert.equal(planForEdge(TTL, { bedId: "bed-b", sets: [{ setId: "set-nope", share: 1 }] }).status, 400);
  assert.equal(planForEdge(TTL, { bedId: "bed-x", sets: [{ setId: "set-kitchen-herbs", share: 1 }] }).status, 404);
});

test("a farm plants every bed from all the sets when asked for the same, else shares them out", () => {
  const farm = `${TTL}
id:farm-f a perma:BedFarm ; rdfs:label "Roof beds" ; perma:inZone id:zone-z ; perma:bedRows 1 ; perma:bedsPerRow 2 ; perma:pathCm 60 ;
  perma:bedLengthCm 300 ; perma:bedWidthCm 100 ; perma:cellSizeCm 10 .
id:bed-f1 a perma:GrowingBed ; rdfs:label "Roof beds 1.1" ; perma:inZone id:zone-z ; perma:inFarm id:farm-f ; perma:lengthCm 300 ; perma:widthCm 100 ; perma:cellSizeCm 10 .
id:bed-f2 a perma:GrowingBed ; rdfs:label "Roof beds 1.2" ; perma:inZone id:zone-z ; perma:inFarm id:farm-f ; perma:lengthCm 300 ; perma:widthCm 100 ; perma:cellSizeCm 10 .`;
  const sets = [{ setId: "set-salad-bed", share: 1 }, { setId: "set-kitchen-herbs", share: 1 }];
  const sets_of = (same: boolean) => (planForEdge(farm, { farmId: "farm-f", sets, same }).body.plans as { sets: unknown[] }[]).map((p) => p.sets.length);
  assert.deepEqual(sets_of(true), [2, 2]);
  assert.deepEqual(sets_of(false), [1, 1]);
  assert.ok((planForEdge(TTL, {}).body.sets as { about: string }[]).every((s) => s.about), "each library set says what it is");
});

test("a bed with growing periods plans the one asked for, by id or by month, around what that period holds", () => {
  const year = `${TTL}
id:period-p1 a perma:GrowingPeriod ; rdfs:label "Spring" ; perma:ofBed id:bed-b ; perma:fromMonth 3 ; perma:toMonth 6 ; perma:periodKind perma:GrowingKind .
id:period-p2 a perma:GrowingPeriod ; rdfs:label "Winter" ; perma:ofBed id:bed-b ; perma:fromMonth 10 ; perma:toMonth 2 ; perma:periodKind perma:RestKind .
id:cell-c1 a perma:PlantingCell ; perma:inBed id:bed-b ; perma:row 0 ; perma:col 0 ; perma:grows <https://permaculture.digitalhome.cloud/id/crop-lettuce> ;
  perma:cellStatus perma:CellPlanned ; perma:inPeriod id:period-p1 .`;
  const what = planForEdge(year, {});
  const periods = (what.body.beds as { periods: { name: string; planted: number }[] }[])[0].periods;
  assert.deepEqual(periods.map((p) => [p.name, p.planted]), [["Spring", 1], ["Winter", 0]]);
  const sets = [{ setId: "set-salad-bed", share: 1 }];
  const byMonth = planForEdge(year, { bedId: "bed-b", sets, month: 4 }).body.plans as { periodId: string; cells: { row: number; col: number }[] }[];
  assert.ok(byMonth[0].periodId.endsWith("period-p1"));
  assert.ok(!byMonth[0].cells.some((c) => c.row === 0 && c.col === 0), "the spring lettuce stays where it is");
  const byId = planForEdge(year, { bedId: "bed-b", sets, periodId: "period-p2" }).body.plans as { periodId: string }[];
  assert.ok(byId[0].periodId.endsWith("period-p2"));
  const none = planForEdge(year, { bedId: "bed-b", sets }).body.plans as { periodId: string | null }[];
  assert.equal(none[0].periodId, null, "without a period or a month: the bed as it stands");
});
