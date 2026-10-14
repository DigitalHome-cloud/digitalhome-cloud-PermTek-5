// Same approach as digitalhome-cloud-darkfactory's core tests: n3 for parsing,
// @zazuko/env-node + rdf-validate-shacl for SHACL, as the Lambdas do.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import N3 from "n3";
import rdf from "@zazuko/env-node";
import SHACLValidator from "rdf-validate-shacl";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");
const parse = (ttl) => new N3.Parser().parse(ttl);

async function validate(abox) {
  const shapes = rdf.dataset(); shapes.addAll(parse(read("shapes/pt-shapes.ttl")));
  const data = rdf.dataset(); data.addAll(parse(abox)); data.addAll(parse(read("tbox/pt-concepts.ttl")));
  return new SHACLValidator(shapes, { factory: rdf }).validate(data);
}

const P = "@prefix app: <https://permtek-5.digitalhome.cloud/ontology#> . @prefix schema: <https://schema.org/> .\n";

test("the T-Box, the concepts and the shapes parse", () => {
  for (const f of ["tbox/app.ttl", "tbox/pt-concepts.ttl", "shapes/pt-shapes.ttl"]) assert.ok(parse(read(f)).length > 5, f);
});

test("every concept is labelled in EN, DE and FR", () => {
  const s = new N3.Store(parse(read("tbox/pt-concepts.ttl")));
  const SKOS = "http://www.w3.org/2004/02/skos/core#";
  for (const c of s.getSubjects("http://www.w3.org/1999/02/22-rdf-syntax-ns#type", SKOS + "Concept", null)) {
    const langs = s.getObjects(c, SKOS + "prefLabel", null).map((o) => o.language);
    for (const l of ["en", "de", "fr"]) assert.ok(langs.includes(l), `${c.value} has no @${l} prefLabel`);
  }
});

test("the example A-Box conforms", async () => {
  const r = await validate(read("abox/examples/example.ttl"));
  assert.ok(r.conforms, r.results.map((x) => x.message?.[0]?.value).join("; "));
});

test("a thing without a name, or with a type from no scheme, does not", async () => {
  assert.equal((await validate(`${P}<https://permtek-5.digitalhome.cloud/id/thing/t-1> a app:Thing .`)).conforms, false);
  assert.equal((await validate(`${P}<https://permtek-5.digitalhome.cloud/id/thing/t-1> a app:Thing ; schema:name "x" ; app:thingType app:Nonsense .`)).conforms, false);
});

// The habitat module (zones, beds, cells, garden plants): validated as the
// graph Lambda does, with the habitat shapes and concepts and no crop library.
async function validateHabitat(abox) {
  const shapes = rdf.dataset(); shapes.addAll(parse(read("shapes/perma-habitat-shapes.ttl"))); shapes.addAll(parse(read("shapes/perma-learning-shapes.ttl")));
  const data = rdf.dataset(); data.addAll(parse(abox)); data.addAll(parse(read("tbox/perma-habitat-concepts.ttl")));
  data.addAll(parse(read("tbox/perma-learning-concepts.ttl")));
  return new SHACLValidator(shapes, { factory: rdf }).validate(data);
}
const messages = (r) => r.results.map((x) => x.message?.[0]?.value).join("; ");
const H = `@prefix perma: <https://permaculture.digitalhome.cloud/ontology#> . @prefix id: <https://permtek-5.digitalhome.cloud/id/> .
@prefix crop: <https://permaculture.digitalhome.cloud/id/> . @prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
id:zone-z-1 a perma:GardenZone ; rdfs:label "Roof" ; perma:zoneKind perma:RoofZone .
id:bed-b-1 a perma:GrowingBed ; rdfs:label "Bed" ; perma:inZone id:zone-z-1 ; perma:lengthCm 300 ; perma:widthCm 120 ; perma:cellSizeCm 10 .
`;

test("the habitat module parses and its concepts are labelled in EN, DE and FR", () => {
  for (const f of ["tbox/perma-habitat.ttl", "tbox/perma-habitat-concepts.ttl", "shapes/perma-habitat-shapes.ttl"]) assert.ok(parse(read(f)).length > 10, f);
  const s = new N3.Store(parse(read("tbox/perma-habitat-concepts.ttl")));
  const SKOS = "http://www.w3.org/2004/02/skos/core#";
  for (const c of s.getSubjects("http://www.w3.org/1999/02/22-rdf-syntax-ns#type", SKOS + "Concept", null)) {
    const langs = s.getObjects(c, SKOS + "prefLabel", null).map((o) => o.language);
    for (const l of ["en", "de", "fr"]) assert.ok(langs.includes(l), `${c.value} has no @${l} prefLabel`);
  }
});

test("the CityDemo habitat conforms", async () => {
  const r = await validateHabitat(read("abox/examples/citydemo-habitat.ttl"));
  assert.ok(r.conforms, messages(r));
});

test("a cell needs a bed, a library crop and a status from the scheme", async () => {
  const ok = await validateHabitat(`${H}id:cell-c1 a perma:PlantingCell ; perma:inBed id:bed-b-1 ; perma:row 0 ; perma:col 2 ; perma:grows crop:crop-lettuce ; perma:cellStatus perma:CellSown .`);
  assert.ok(ok.conforms, messages(ok));
  for (const bad of [
    `id:cell-c1 a perma:PlantingCell ; perma:inBed id:zone-z-1 ; perma:row 0 ; perma:col 2 ; perma:grows crop:crop-lettuce ; perma:cellStatus perma:CellSown .`,
    `id:cell-c1 a perma:PlantingCell ; perma:inBed id:bed-b-1 ; perma:row -1 ; perma:col 2 ; perma:grows crop:crop-lettuce ; perma:cellStatus perma:CellSown .`,
    `id:cell-c1 a perma:PlantingCell ; perma:inBed id:bed-b-1 ; perma:row 0 ; perma:col 2 ; perma:grows <https://example.org/lettuce> ; perma:cellStatus perma:CellSown .`,
    `id:cell-c1 a perma:PlantingCell ; perma:inBed id:bed-b-1 ; perma:row 0 ; perma:col 2 ; perma:grows crop:crop-lettuce ; perma:cellStatus perma:RoofZone .`,
  ]) assert.equal((await validateHabitat(H + bad)).conforms, false, bad);
});

test("a zone needs a kind; a garden plant a zone and a crop", async () => {
  assert.equal((await validateHabitat(`${H}id:zone-z-2 a perma:GardenZone ; rdfs:label "x" .`)).conforms, false);
  assert.equal((await validateHabitat(`${H}id:plant-p-1 a perma:GardenPlant ; rdfs:label "Pear" ; perma:grows crop:crop-pear .`)).conforms, false);
  assert.equal((await validateHabitat(`${H}id:zone-z-1 perma:microclimateOffsetC 9.0 .`)).conforms, false);
});

test("a wicking bed: tank pipes, a substrate from the scheme, a worm box shorter than the bed", async () => {
  const bed = (extra) => `@prefix perma: <https://permaculture.digitalhome.cloud/ontology#> . @prefix id: <https://permtek-5.digitalhome.cloud/id/> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
id:zone-z-1 a perma:GardenZone ; rdfs:label "Roof" ; perma:zoneKind perma:RoofZone .
id:bed-b-1 a perma:GrowingBed ; rdfs:label "Bed" ; perma:inZone id:zone-z-1 ; perma:lengthCm 300 ; perma:widthCm 100 ; perma:cellSizeCm 10 ; ${extra} .`;
  const ok = await validateHabitat(bed("perma:substrateKind perma:LightweightRoofSubstrate ; perma:tankPipeCount 3 ; perma:tankPipeMm 110 ; perma:wormBinCm 40"));
  assert.ok(ok.conforms, messages(ok));
  for (const bad of ["perma:wormBinCm 300", "perma:wormBinCm 450", "perma:substrateKind perma:RoofZone", "perma:tankPipeCount 40", "perma:tankPipeMm 20"]) {
    assert.equal((await validateHabitat(bed(bad))).conforms, false, bad);
  }
});

test("a Perma5Guild needs a name, an area and a type; a bed joins at most one guild", async () => {
  const P = `@prefix perma: <https://permaculture.digitalhome.cloud/ontology#> . @prefix id: <https://permtek-5.digitalhome.cloud/id/> .
@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .
id:zone-z-1 a perma:GardenZone ; rdfs:label "Roof" ; perma:zoneKind perma:RoofZone .
`;
  const guild = `id:guild-g-1 a perma:Guild ; rdfs:label "Roof guild" ; perma:inZone id:zone-z-1 ; perma:guildType perma:WormBed5 ; perma:robotModel perma:Gantry5Gen1 ; perma:wormsMayLeave true .
`;
  const bed = (extra) => `id:bed-b-1 a perma:GrowingBed ; rdfs:label "Bed" ; perma:inZone id:zone-z-1 ; perma:lengthCm 300 ; perma:widthCm 100 ; perma:cellSizeCm 10 ${extra} .`;
  const ok = await validateHabitat(P + guild + bed("; perma:inGuild id:guild-g-1"));
  assert.ok(ok.conforms, messages(ok));
  assert.ok((await validateHabitat(P + bed(""))).conforms, "a plain bed needs no guild");
  for (const bad of [
    P + `id:guild-g-1 a perma:Guild ; rdfs:label "x" ; perma:inZone id:zone-z-1 .`,
    P + `id:guild-g-1 a perma:Guild ; rdfs:label "x" ; perma:inZone id:zone-z-1 ; perma:guildType perma:RoofZone .`,
    P + `id:guild-g-1 a perma:Guild ; rdfs:label "x" ; perma:inZone id:zone-z-1 ; perma:guildType perma:WormBed5 ; perma:robotModel perma:WormBed5 .`,
    P + guild + bed("; perma:inGuild id:zone-z-1"),
  ]) assert.equal((await validateHabitat(bad)).conforms, false, bad.slice(-120));
});

// ------------------------------------------------------------ water and learning (docs/adr/0025, 0026)

const W = `${H}id:guild-g-1 a perma:Guild ; rdfs:label "Guild" ; perma:inZone id:zone-z-1 ; perma:guildType perma:WormBed5 .
id:store-s-barrel a perma:WaterStore ; rdfs:label "Barrel" ; perma:inGuild id:guild-g-1 ; perma:storeKind perma:RainBarrel ;
  perma:capacityL 200.0 ; perma:holds perma:CleanWater .
id:store-s-sump a perma:WaterStore ; rdfs:label "Sump" ; perma:inGuild id:guild-g-1 ; perma:storeKind perma:WormBoxSump ;
  perma:capacityL 14.4 ; perma:holds perma:WormLiquid .
id:store-s-pipes a perma:WaterStore ; rdfs:label "Pipes" ; perma:inGuild id:guild-g-1 ; perma:storeKind perma:TankPipes ;
  perma:holds perma:CleanWater , perma:WormLiquid .
`;

test("the learning module parses and its concepts are labelled in EN, DE and FR", () => {
  for (const f of ["tbox/perma-learning.ttl", "tbox/perma-learning-concepts.ttl", "shapes/perma-learning-shapes.ttl"]) assert.ok(parse(read(f)).length > 10, f);
  const s = new N3.Store(parse(read("tbox/perma-learning-concepts.ttl")));
  const SKOS = "http://www.w3.org/2004/02/skos/core#";
  for (const c of s.getSubjects("http://www.w3.org/1999/02/22-rdf-syntax-ns#type", SKOS + "Concept", null)) {
    const langs = s.getObjects(c, SKOS + "prefLabel", null).map((o) => o.language);
    for (const l of ["en", "de", "fr"]) assert.ok(langs.includes(l), `${c.value} has no @${l} prefLabel`);
  }
});

test("water flows: worm liquid may go to the tank pipes, never into the clean rain barrel", async () => {
  const ok = await validateHabitat(`${W}id:valve-v-1 a perma:Valve ; rdfs:label "Sump to bed" ; perma:inGuild id:guild-g-1 ;
    perma:flowFrom id:store-s-sump ; perma:flowTo id:store-s-pipes ; perma:valveKind perma:EdgeValve .
    id:valve-v-2 a perma:Valve ; rdfs:label "Barrel tap" ; perma:inGuild id:guild-g-1 ;
    perma:flowFrom id:store-s-barrel ; perma:flowTo id:store-s-pipes ; perma:valveKind perma:ManualTap .`);
  assert.ok(ok.conforms, messages(ok));
  const bad = await validateHabitat(`${W}id:valve-v-1 a perma:Valve ; rdfs:label "Wrong way" ; perma:inGuild id:guild-g-1 ;
    perma:flowFrom id:store-s-sump ; perma:flowTo id:store-s-barrel ; perma:valveKind perma:EdgeValve .`);
  assert.equal(bad.conforms, false);
  assert.match(messages(bad), /Worm liquid never flows into a store kept for clean water/);
  const noEnd = await validateHabitat(`${W}id:valve-v-1 a perma:Valve ; rdfs:label "Half" ; perma:inGuild id:guild-g-1 ;
    perma:flowFrom id:store-s-sump ; perma:valveKind perma:EdgeValve .`);
  assert.equal(noEnd.conforms, false, "a valve joins two stores");
});

const L = `${W}@prefix xsd: <http://www.w3.org/2001/XMLSchema#> . @prefix sosa: <http://www.w3.org/ns/sosa/> .
id:measure-m-1 a perma:Measure ; rdfs:label "Liquid out"@en ; perma:everyDays 30 ; perma:reading "wormBin.sumpL" .
id:cycle-y-1 a perma:LearningCycle ; rdfs:label "Sizing"@en ; perma:about id:guild-g-1 ; perma:cyclePhase perma:PlanPhase ;
  perma:hasHypothesis id:hyp-h-1 .
`;

test("a hypothesis has its range around the number expected, a unit and a measure; a check a number and a day", async () => {
  const hyp = (low, exp, high) => `id:hyp-h-1 a perma:Hypothesis ; rdfs:label "Liquid per kg"@en ; perma:expected ${exp} ;
    perma:low ${low} ; perma:high ${high} ; perma:unit "l/kg" ; perma:measuredBy id:measure-m-1 ; perma:verdict perma:VerdictOpen .`;
  const ok = await validateHabitat(`${L}${hyp("0.05", "0.15", "0.30")}
    id:check-k-1 a perma:Check ; perma:ofHypothesis id:hyp-h-1 ; sosa:hasSimpleResult 0.12 ; sosa:resultTime "2026-05-01"^^xsd:date ; perma:checkedBy "person" .`);
  assert.ok(ok.conforms, messages(ok));
  assert.equal((await validateHabitat(`${L}${hyp("0.40", "0.15", "0.30")}`)).conforms, false, "lowest above expected");
  assert.equal((await validateHabitat(`${L}${hyp("0.05", "0.35", "0.30")}`)).conforms, false, "expected above highest");
  assert.equal((await validateHabitat(`${L}${hyp("0.05", "0.15", "0.30")}
    id:check-k-1 a perma:Check ; perma:ofHypothesis id:hyp-h-1 ; sosa:hasSimpleResult 0.12 .`)).conforms, false, "a check without its day");
  assert.equal((await validateHabitat(`${L}id:cycle-y-1 perma:cyclePhase perma:Nonsense .`)).conforms, false, "a phase from no scheme");
});
