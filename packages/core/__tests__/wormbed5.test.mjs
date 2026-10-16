import assert from "node:assert/strict";
import { test } from "node:test";

import {
  GANTRY5, checkHabitat, emptyHabitat, tooTallForGantry, habitatFromTtl, habitatToTtl, minDepthCm, newWormBedFarm, planFarm, plantSets,
  wormBedParts, wormBoxCm, wormBoxYear,
} from "../dist/index.js";

// docs/adr/0028: a WormBed5, guided.

test("the worm box is sized by the household: 30 cm at least, a quarter of the bed at most", () => {
  assert.equal(wormBoxCm(2, 100, 300), 40, "the reference: two people, a 1 m wide bed");
  assert.equal(wormBoxCm(1, 100, 300), 30, "never under 30 cm: a small box loses its warmth");
  assert.equal(wormBoxCm(6, 100, 300), 70, "never over a quarter of the bed's length");
  assert.equal(wormBoxCm(3, 120, 300), 50, "a wider bed needs a shorter box for the same people");
});

test("a worm box's year: the reference box feeds on two people and makes more castings than its bed uses", () => {
  const y = wormBoxYear({ id: "b", name: "b", zoneId: "z", lengthCm: 300, widthCm: 120, cellCm: 10, wormBinCm: 40 });
  assert.equal(y.scrapsKg, 90, "docs/specs/wormbed5-sizing.md H1");
  assert.ok(y.people > 2 && y.people < 3, "H6: the scraps of 2–3 people");
  assert.ok(y.castingsKg > 2 * y.bedUsesKg, "the rest of the castings goes to other plants (the spec's way B)");
});

test("how deep a crop wants the substrate: the spec's table first, else by its roots", () => {
  assert.equal(minDepthCm("crop-lettuce"), 15);
  assert.equal(minDepthCm("crop-tomato"), 35);
  assert.equal(minDepthCm("crop-thyme"), 15, "shallow roots");
  for (const s of plantSets()) for (const m of s.members) assert.ok(minDepthCm(m.cropId), `${m.cropId} has a depth`);
});

test("every library set explains itself in EN, DE and FR", () => {
  for (const s of plantSets()) {
    assert.deepEqual(Object.keys(s.about).sort(), ["de", "en", "fr"], s.id);
    assert.deepEqual(Object.keys(s.why).sort(), ["de", "en", "fr"], s.id);
  }
});

test("a farm of WormBed5: each bed its own guild with a worm box, round trip, same or shared-out sets", async () => {
  const zone = { id: "https://permtek-5.digitalhome.cloud/id/zone-z", name: "Roof", kind: "RoofZone", exposure: [] };
  const size = { lengthCm: 300, widthCm: 100, depthCm: 25, wormBinCm: 40, tank: false, pathCm: 60 };
  const { farm, guilds, beds } = newWormBedFarm(zone, "Roof beds", 1, 3, size);
  assert.equal(guilds.length, 3);
  assert.ok(beds.every((b, i) => b.guildId === guilds[i].id && b.farmId === farm.id && b.wormBinCm === 40 && b.depthCm === 25));
  const h = { ...emptyHabitat(), zones: [zone], farms: [farm], guilds, beds };
  assert.deepEqual(checkHabitat(h), []);
  const back = habitatFromTtl(await habitatToTtl(h));
  assert.equal(back.guilds.length, 3);
  assert.deepEqual(wormBedParts({ ...size, tank: true }).tankPipes, 8);

  const choices = [{ setId: "set-salad-bed", share: 1 }, { setId: "set-kitchen-herbs", share: 1 }];
  const same = planFarm(beds, choices, [], { same: true });
  assert.ok(same.every((p) => p.choices.length === 2), "every bed gets both sets");
  const shared = planFarm(beds, choices);
  assert.ok(shared.every((p) => p.choices.length === 1), "each bed gets one of them");
});

test("a space's own set keeps its explanation in every language", async () => {
  const own = { id: "https://permtek-5.digitalhome.cloud/id/set-shade", names: { en: "Shady herbs", de: "Schattenkräuter" }, for: ["RectangleBedSurface"],
    about: { en: "Herbs for a shady corner." }, why: { en: "Parsley and chives stand shade.", de: "Petersilie und Schnittlauch vertragen Schatten." },
    members: [{ cropId: "crop-parsley", share: 1 }] };
  const back = habitatFromTtl(await habitatToTtl({ ...emptyHabitat(), plantSets: [own] }));
  assert.deepEqual(back.plantSets, [own]);
});

test("a crop taller than the gantry's raised tool is in its way", () => {
  assert.equal(GANTRY5.toolClearanceCm, 42);
  assert.equal(tooTallForGantry("crop-tomato"), true, "a staked tomato");
  assert.equal(tooTallForGantry("crop-lettuce"), false);
});
