// npm test (backend): the Lambdas validate against the same files as
// packages/ontology, and refuse what its shapes refuse (ADR-0007).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { CONCEPTS, SHAPES, SOURCES, TBOX } from "./ontology.generated";
import { validateAbox } from "./validate";

const ONTOLOGY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../packages/ontology");
const read = (rel: string) => fs.readFileSync(path.join(ONTOLOGY, rel), "utf8");
const P = `@prefix app: <https://permtek-5.digitalhome.cloud/ontology#> . @prefix schema: <https://schema.org/> .\n`;

test("the generated copy matches packages/ontology", () => {
  const joined = (files: string[]) => files.map(read).join("\n");
  assert.equal(TBOX, joined(SOURCES.TBOX), "run: node backend/scripts/sync-ontology.mjs");
  assert.equal(CONCEPTS, joined(SOURCES.CONCEPTS), "run: node backend/scripts/sync-ontology.mjs");
  assert.equal(SHAPES, joined(SOURCES.SHAPES), "run: node backend/scripts/sync-ontology.mjs");
});

test("a conforming A-Box is accepted", async () => {
  const v = await validateAbox(`${P}<https://permtek-5.digitalhome.cloud/id/thing/t-1> a app:Thing ; schema:name "Printer" ; app:thingType app:Device .`);
  assert.equal(v.ok, true, v.problems.join("; "));
  assert.equal(v.triples, 3);
});

test("a thing without a name is refused, with the shape's message", async () => {
  const v = await validateAbox(`${P}<https://permtek-5.digitalhome.cloud/id/thing/t-1> a app:Thing .`);
  assert.equal(v.ok, false);
  assert.ok(v.problems.some((p) => /needs a name/.test(p)), v.problems.join("; "));
});

test("an A-Box may not describe the vocabulary or anything outside the id space", async () => {
  const v = await validateAbox(`${P}app:Thing a <http://www.w3.org/2002/07/owl#Class> .`);
  assert.equal(v.ok, false);
  assert.match(v.problems[0], /outside/);
});

test("not Turtle is refused, not thrown", async () => {
  const v = await validateAbox("this is not turtle");
  assert.equal(v.ok, false);
  assert.match(v.problems[0], /not valid Turtle/);
});

// The habitat's A-Box (docs/adr/0016) is checked by the same Lambda.
test("the CityDemo habitat is accepted; a cell with no bed is refused", async () => {
  const demo = await validateAbox(read("abox/examples/citydemo-habitat.ttl"));
  assert.equal(demo.ok, true, demo.problems.join("; "));
  const bad = await validateAbox(`@prefix perma: <https://permaculture.digitalhome.cloud/ontology#> .
<https://permtek-5.digitalhome.cloud/id/cell-c1> a perma:PlantingCell ; perma:row 0 ; perma:col 0 ;
  perma:grows <https://permaculture.digitalhome.cloud/id/crop-lettuce> ; perma:cellStatus perma:CellSown .`);
  assert.equal(bad.ok, false);
  assert.ok(bad.problems.some((p) => /belongs to one bed/.test(p)), bad.problems.join("; "));
});

// A household's own recipes live in its space's A-Box too (docs/adr/0021).
test("a household's recipe is accepted; a line that names something that is not a crop is refused", async () => {
  const P2 = `@prefix perma: <https://permaculture.digitalhome.cloud/ontology#> . @prefix schema: <https://schema.org/> .
@prefix id: <https://permtek-5.digitalhome.cloud/id/> . @prefix crop: <https://permaculture.digitalhome.cloud/id/> .\n`;
  const good = await validateAbox(`${P2}id:recipe-r1 a schema:Recipe ; schema:name "Burger aux carottes"@fr ;
  perma:usesIngredient <https://permtek-5.digitalhome.cloud/id/recipe-r1/line-1> , <https://permtek-5.digitalhome.cloud/id/recipe-r1/line-2> .
<https://permtek-5.digitalhome.cloud/id/recipe-r1/line-1> schema:name "3 carottes" ; perma:crop crop:crop-carrot ; perma:part perma:Root ; perma:acceptsMethod perma:Fresh .
<https://permtek-5.digitalhome.cloud/id/recipe-r1/line-2> schema:name "1 œuf" .`);
  assert.equal(good.ok, true, good.problems.join("; "));
  const bad = await validateAbox(`${P2}id:recipe-r2 a schema:Recipe ; schema:name "x" ;
  perma:usesIngredient <https://permtek-5.digitalhome.cloud/id/recipe-r2/line-1> .
<https://permtek-5.digitalhome.cloud/id/recipe-r2/line-1> schema:name "tofu" ; perma:crop crop:crop-tofu ; perma:part perma:Root .`);
  assert.equal(bad.ok, false);
  const nameless = await validateAbox(`${P2}id:recipe-r3 a schema:Recipe ; perma:usesIngredient <https://permtek-5.digitalhome.cloud/id/recipe-r3/line-1> .
<https://permtek-5.digitalhome.cloud/id/recipe-r3/line-1> schema:name "sel" .`);
  assert.ok(nameless.problems.some((p) => /needs a name/.test(p)), nameless.problems.join("; "));
});
