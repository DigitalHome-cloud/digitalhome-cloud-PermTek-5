import assert from "node:assert/strict";
import { test } from "node:test";

import { CARE_GUIDE, autopilotPolicy, careDue, careInMonth, careRhythms } from "../dist/index.js";

// docs/adr/0024: the care calendar. Dates are local days.
const byId = (list) => Object.fromEntries(list.map((d) => [d.task.id, d]));

test("every task says who does it, in three languages, and has a rhythm, months or a trigger", () => {
  assert.ok(CARE_GUIDE.tasks.length >= 15);
  for (const t of CARE_GUIDE.tasks) {
    assert.ok(["robot", "person"].includes(t.who), t.id);
    for (const l of ["en", "de", "fr"]) assert.ok(t.label[l] && t.why[l], `${t.id} ${l}`);
    assert.ok(t.everyDays || t.months?.length, t.id);
  }
  assert.equal(new Set(CARE_GUIDE.tasks.map((t) => t.id)).size, CARE_GUIDE.tasks.length, "ids are unique");
});

test("a rhythm falls due when its days have run out, and counts how late it is", () => {
  const d = byId(careDue(CARE_GUIDE, { hopper: "2026-10-01", buffer: "2026-10-01" }, "2026-10-08"));
  assert.equal(d.hopper.due, true);
  assert.equal(d.hopper.reason, "rhythm");
  assert.equal(d.hopper.nextOn, "2026-10-08");
  assert.equal(d.buffer.due, false, "monthly: not yet");
  assert.equal(d.buffer.nextOn, "2026-10-31");
  assert.equal(byId(careDue(CARE_GUIDE, { hopper: "2026-10-01" }, "2026-10-11")).hopper.overdueDays, 3);
  assert.equal(byId(careDue(CARE_GUIDE, {}, "2026-10-11")).hopper.reason, "never", "never done: due now");
});

test("a seasonal task is due from its first month until it is done in that run of months", () => {
  const oct = byId(careDue(CARE_GUIDE, { wrap: "2025-11-02" }, "2026-10-14"));
  assert.equal(oct.wrap.reason, "season");
  assert.equal(byId(careDue(CARE_GUIDE, { wrap: "2026-10-20" }, "2026-11-05")).wrap.due, false, "done in October: not again in November");
  assert.equal(byId(careDue(CARE_GUIDE, { wrap: "2025-11-02" }, "2026-07-01")).wrap.due, false, "out of season");
  // a run that crosses the new year counts from its first month
  const guide = { id: "g", tasks: [{ id: "w", who: "person", label: {}, why: {}, months: [12, 1, 2] }] };
  assert.equal(careDue(guide, { w: "2026-12-10" }, "2027-01-20")[0].due, false);
  assert.equal(careDue(guide, { w: "2026-11-30" }, "2027-01-20")[0].due, true);
});

test("a reaction of the keeper brings a task forward, once a day at most", () => {
  const calm = byId(careDue(CARE_GUIDE, { sump: "2026-10-12" }, "2026-10-14"));
  assert.equal(calm.sump.due, false);
  const full = byId(careDue(CARE_GUIDE, { sump: "2026-10-12" }, "2026-10-14", ["sump-full"]));
  assert.equal(full.sump.reason, "brought");
  assert.equal(byId(careDue(CARE_GUIDE, { sump: "2026-10-14" }, "2026-10-14", ["sump-full"])).sump.due, false, "just done");
});

test("the year view and the rhythms", () => {
  assert.deepEqual(careInMonth(CARE_GUIDE, 10).map((t) => t.id).sort(), ["cover", "mulch", "wrap"]);
  const r = careRhythms(CARE_GUIDE);
  assert.equal(r[0].everyDays, 1);
  assert.ok(r.every((t, i) => i === 0 || r[i - 1].everyDays <= t.everyDays));
});

test("the autopilot's policy is the guide's, and falls back to the defaults part by part (docs/adr/0031)", () => {
  const p = autopilotPolicy();
  assert.deepEqual(p.order.slice(0, 3), ["harvest", "clear", "period"], "harvest first: ripe plants are lost otherwise");
  assert.deepEqual(p.daily, ["scan", "probe", "photo"]);
  for (const d of p.daily) assert.ok(p.order.includes(d), d);
  assert.equal(p.refills.tankShare, 0.2);
  assert.equal(Object.values(p.fills.hopper).reduce((a, b) => a + b, 0), 1000);
  for (const l of ["en", "de", "fr"]) assert.ok(CARE_GUIDE.autopilot.about[l], l);
  const own = autopilotPolicy({ id: "x", tasks: [], autopilot: { refills: { tankShare: 0.5 } } });
  assert.equal(own.refills.tankShare, 0.5);
  assert.equal(own.refills.hopperGrams, 300, "an unset level keeps its default");
  assert.deepEqual(own.order, p.order);
});
