import assert from "node:assert/strict";
import fs from "node:fs";
import { test } from "node:test";

import { ROBOT_NAME, checkHabitat, habitatFromTtl, habitatToTtl, newGuild } from "../dist/index.js";

// docs/adr/0020: a Perma5Guild is an area's working unit; its type fixes the structure.
const DEMO = fs.readFileSync(new URL("../../ontology/abox/examples/citydemo-habitat.ttl", import.meta.url), "utf8");

test("CityDemo's roof is a WormBed5 guild worked by a Gantry5-gen1", async () => {
  const h = habitatFromTtl(DEMO);
  assert.equal(h.guilds.length, 1);
  const g = h.guilds[0];
  assert.deepEqual([g.name, g.type, g.robot, g.wormsMayLeave], ["Roof guild", "WormBed5", "Gantry5Gen1", true]);
  assert.equal(ROBOT_NAME[g.robot], "Gantry5-gen1");
  assert.equal(h.beds[0].guildId, g.id);
  assert.deepEqual(checkHabitat(h), []);
  assert.deepEqual(habitatFromTtl(await habitatToTtl(h)), h, "the guild survives a round trip");
});

test("a map saved before guilds existed still loads and checks clean", () => {
  const old = DEMO.replace(/id:guild-g-cityroof a perma:Guild[\s\S]*?\.\n/, "").replace(" perma:inGuild id:guild-g-cityroof ;", "");
  const h = habitatFromTtl(old);
  assert.deepEqual([h.guilds.length, h.beds.length, h.beds[0].guildId], [0, 1, undefined]);
  assert.deepEqual(checkHabitat(h), []);
});

test("a WormBed5 guild is exactly one bed, in the guild's own area", () => {
  const h = habitatFromTtl(DEMO);
  const bed = h.beds[0];
  const none = { ...h, beds: [{ ...bed, guildId: undefined }] };
  assert.deepEqual(checkHabitat(none).map((p) => p.code), ["guildBeds"]);
  const two = { ...h, beds: [bed, { ...bed, id: bed.id + "2" }], cells: [] };
  assert.deepEqual(checkHabitat(two).map((p) => p.code), ["guildBeds"]);
  const elsewhere = { ...h, beds: [{ ...bed, zoneId: h.zones[0].id }] };
  assert.ok(checkHabitat(elsewhere).some((p) => p.code === "noGuild"));
});

test("a new guild starts with the bed its type calls for", () => {
  const roof = { id: "z", name: "Roof", kind: "RoofZone", exposure: [] };
  const { guild, bed } = newGuild(roof, "Roof guild", "Roof bed");
  assert.deepEqual([guild.type, guild.robot, guild.wormsMayLeave, guild.zoneId], ["WormBed5", "Gantry5Gen1", true, "z"]);
  assert.deepEqual([bed.guildId, bed.lengthCm, bed.widthCm, bed.depthCm, bed.wormBinCm, bed.substrate],
    [guild.id, 300, 100, 15, 40, "LightweightRoofSubstrate"]);
  assert.equal(newGuild({ ...roof, kind: "GroundZone" }, "g", "b").bed.substrate, "GardenSoil");
  assert.deepEqual(checkHabitat({ zones: [roof], guilds: [guild], beds: [bed], cells: [], plants: [], rest: "" }), []);
});
