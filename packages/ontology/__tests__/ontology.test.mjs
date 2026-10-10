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
  const shapes = rdf.dataset(); shapes.addAll(parse(read("shapes/perma-habitat-shapes.ttl")));
  const data = rdf.dataset(); data.addAll(parse(abox)); data.addAll(parse(read("tbox/perma-habitat-concepts.ttl")));
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
