import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

import { SIZING_GUIDE, adoptStarter, checksDue, habitatFromTtl, habitatToTtl, nextCycle, nextPhase, say, verdict } from "../dist/index.js";

// docs/adr/0026: the habitat's second brain, plan-do-check-act about a guild.
const DEMO = fs.readFileSync(new URL("../../ontology/abox/examples/citydemo-habitat.ttl", import.meta.url), "utf8");
const GUILD = "https://permtek-5.digitalhome.cloud/id/guild-g-cityroof";

test("the sizing starter becomes a cycle in Plan: seven hypotheses, each with its measure, for a year", () => {
  const c = adoptStarter(SIZING_GUIDE, GUILD, "2026-04-01");
  assert.equal(c.phase, "PlanPhase");
  assert.deepEqual([c.startedOn, c.endsOn], ["2026-04-01", "2027-04-01"]);
  assert.equal(c.hypotheses.length, 7);
  const ids = new Set(c.measures.map((m) => m.id));
  for (const h of c.hypotheses) {
    assert.ok(ids.has(h.measureId), `${h.code} has its measure`);
    assert.ok(h.low <= h.expected && h.expected <= h.high, `${h.code}: low <= expected <= high`);
    assert.ok(h.label.de && h.label.fr, `${h.code} in DE and FR`);
  }
  assert.equal(say(c.hypotheses.find((h) => h.code === "H2").label, "fr"), "Liquide au puisard par kg mangé (sans pluie)");
  assert.equal(c.hypotheses.find((h) => h.code === "H3").measureId, c.hypotheses.find((h) => h.code === "H4").measureId, "H3 and H4 share M4");
});

test("a verdict: holds while in range; one check out is open; two running out, or out at the end, fails", () => {
  const h = { id: "h", expected: 0.15, low: 0.05, high: 0.3, unit: "l/kg", label: {}, measureId: "m" };
  const k = (on, value) => ({ id: on, hypothesisId: "h", on, value });
  assert.equal(verdict(h, []), "VerdictOpen");
  assert.equal(verdict(h, [k("2026-05-01", 0.12)]), "VerdictHolds");
  assert.equal(verdict(h, [k("2026-05-01", 0.12), k("2026-06-01", 0.4)]), "VerdictOpen", "one out: watch");
  assert.equal(verdict(h, [k("2026-06-01", 0.4), k("2026-05-01", 0.12), k("2026-07-01", 0.35)]), "VerdictFails", "two running out, in date order");
  assert.equal(verdict(h, [k("2026-05-01", 0.12), k("2026-06-01", 0.4)], true), "VerdictFails", "out at the season's end");
  assert.equal(verdict(h, [k("2026-06-01", 0.4), k("2026-07-01", 0.2)]), "VerdictHolds", "back in range");
});

test("the phases run plan, do, check, act, and stop there", () => {
  assert.deepEqual(["PlanPhase", "DoPhase", "CheckPhase", "ActPhase"].map(nextPhase), ["DoPhase", "CheckPhase", "ActPhase", "ActPhase"]);
});

test("checks are due by each measure's rhythm, only while measuring", () => {
  const c = adoptStarter(SIZING_GUIDE, GUILD, "2026-04-01");
  assert.deepEqual(checksDue(c, "2026-04-02"), [], "in Plan nothing is due");
  const doing = { ...c, phase: "DoPhase" };
  assert.equal(checksDue(doing, "2026-04-01").length, c.measures.length, "at the start every measure is due");
  const m3 = c.measures.find((m) => m.code === "M3"), h2 = c.hypotheses.find((h) => h.code === "H2");
  const checked = { ...doing, checks: [{ id: "k", hypothesisId: h2.id, value: 0.1, on: "2026-04-01" }] };
  assert.ok(!checksDue(checked, "2026-04-20").some((d) => d.measure.id === m3.id), "M3 checked: not due for 30 days");
  assert.ok(checksDue(checked, "2026-05-01").some((d) => d.measure.id === m3.id && d.lastOn === "2026-04-01"));
});

test("the next cycle keeps the measures and the act's numbers, and starts afresh", () => {
  const c = adoptStarter(SIZING_GUIDE, GUILD, "2026-04-01");
  const acted = { ...c, phase: "ActPhase", hypotheses: c.hypotheses.map((h) => (h.code === "H2" ? { ...h, expected: 0.1, low: 0.03, high: 0.2, verdict: "VerdictFails", actTaken: "less liquid than thought" } : h)),
    checks: [{ id: "k", hypothesisId: c.hypotheses[1].id, value: 0.08, on: "2026-05-01" }] };
  const n = nextCycle(acted, "2027-04-01");
  assert.equal(n.phase, "PlanPhase");
  assert.equal(n.checks.length, 0);
  const h2 = n.hypotheses.find((h) => h.code === "H2");
  assert.deepEqual([h2.expected, h2.low, h2.high, h2.verdict, h2.actTaken], [0.1, 0.03, 0.2, "VerdictOpen", undefined]);
  assert.ok(n.measures.some((m) => m.id === h2.measureId), "its measure came along");
  assert.notEqual(n.id, c.id);
  assert.match(n.name.de, /nächster/);
});

test("CityDemo's cycle and an adopted one survive a round trip through the graph", async () => {
  const h = habitatFromTtl(DEMO);
  assert.equal(h.cycles.length, 1);
  const c = h.cycles[0];
  assert.deepEqual([c.phase, c.hypotheses[0].code, c.measures[0].reading, c.checks[0].value, c.checks[0].by], ["DoPhase", "H2", "wormBin.sumpL", 0.12, "person"]);
  const more = { ...h, cycles: [...h.cycles, adoptStarter(SIZING_GUIDE, h.guilds[0].id, "2026-10-14")] };
  const back = habitatFromTtl(await habitatToTtl(more));
  const sortById = (x) => [...x].sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(sortById(back.cycles), sortById(more.cycles.map((cy) => ({
    ...cy, hypotheses: [...cy.hypotheses].sort((a, b) => (a.code ?? a.id).localeCompare(b.code ?? b.id, undefined, { numeric: true })),
    measures: [...cy.measures].sort((a, b) => (a.code ?? a.id).localeCompare(b.code ?? b.id, undefined, { numeric: true })),
  }))));
});
