/**
 * A habitat <-> its A-Box in Turtle (the shared space's graph, ADR-0007).
 *
 * Reads what the habitat module knows (zones, beds, cells, garden plants, the
 * guilds' water) and the learning module's cycles (docs/adr/0026), and
 * keeps every other triple untouched in `rest`, so a save from the app never
 * drops what an edge or another tool wrote into the same graph.
 */
import N3 from "n3";
import type { Quad, Term } from "n3";
import { CROP_IRI } from "./library.js";
import type { Recipe, RecipeLine } from "./recipes.js";
import {
  CELL_STATUSES, EXPOSURES, GUILD_TYPES, STORE_KINDS, SUBSTRATE_KINDS, VALVE_KINDS, WATER_KINDS, ZONE_KINDS,
  type Bed, type Cell, type CellStatus, type Exposure, type GardenPlant, type Guild, type GuildType, type Habitat, type RainCatchment, type RobotModel,
  type StoreKind, type SubstrateKind, type Valve, type ValveKind, type WaterKind, type WaterStore, type Zone, type ZoneKind,
} from "./habitatModel.js";
import { PHASES, VERDICTS, type Check, type Hypothesis, type Lang, type LearningCycle, type Measure, type Phase, type Texts, type Verdict } from "./learning.js";

const { namedNode, literal, quad } = N3.DataFactory;
const PERMA = "https://permaculture.digitalhome.cloud/ontology#";
const SCHEMA = "https://schema.org/";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const LABEL = "http://www.w3.org/2000/01/rdf-schema#label";
const COMMENT = "http://www.w3.org/2000/01/rdf-schema#comment";
const SOSA = "http://www.w3.org/ns/sosa/";
const XSD = "http://www.w3.org/2001/XMLSchema#";
const p = (local: string) => namedNode(PERMA + local);

const PREFIXES = {
  perma: PERMA,
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  xsd: XSD,
  schema: SCHEMA,
  sosa: SOSA,
  id: "https://permtek-5.digitalhome.cloud/id/",
  crop: CROP_IRI,
};

const int = (n: number) => literal(String(Math.round(n)), namedNode(XSD + "integer"));
const dec = (n: number) => literal(String(n), namedNode(XSD + "decimal"));

export function habitatToTtl(h: Habitat): Promise<string> {
  const qs: Quad[] = [];
  const add = (s: string, pr: string, o: Term) => qs.push(quad(namedNode(s), pr === "a" ? namedNode(RDF_TYPE) : p(pr), o as never));
  const name = (s: string, n: string) => qs.push(quad(namedNode(s), namedNode(LABEL), literal(n)));
  for (const z of h.zones) {
    add(z.id, "a", p("GardenZone")); name(z.id, z.name);
    add(z.id, "zoneKind", p(z.kind));
    for (const e of z.exposure) add(z.id, "exposure", p(e));
    if (z.areaM2 !== undefined) add(z.id, "areaM2", dec(z.areaM2));
    if (z.offsetC !== undefined) add(z.id, "microclimateOffsetC", dec(z.offsetC));
  }
  for (const g of h.guilds ?? []) {
    add(g.id, "a", p("Guild")); name(g.id, g.name);
    add(g.id, "inZone", namedNode(g.zoneId));
    add(g.id, "guildType", p(g.type));
    if (g.robot) add(g.id, "robotModel", p(g.robot));
    if (g.wormsMayLeave !== undefined) add(g.id, "wormsMayLeave", literal(String(g.wormsMayLeave), namedNode(XSD + "boolean")));
  }
  for (const b of h.beds) {
    add(b.id, "a", p("GrowingBed")); name(b.id, b.name);
    add(b.id, "inZone", namedNode(b.zoneId));
    if (b.guildId) add(b.id, "inGuild", namedNode(b.guildId));
    add(b.id, "lengthCm", int(b.lengthCm)); add(b.id, "widthCm", int(b.widthCm));
    if (b.depthCm !== undefined) add(b.id, "substrateDepthCm", int(b.depthCm));
    add(b.id, "cellSizeCm", int(b.cellCm));
    if (b.substrate) add(b.id, "substrateKind", p(b.substrate));
    if (b.tankPipes !== undefined) add(b.id, "tankPipeCount", int(b.tankPipes));
    if (b.tankPipeMm !== undefined) add(b.id, "tankPipeMm", int(b.tankPipeMm));
    if (b.wormBinCm !== undefined) add(b.id, "wormBinCm", int(b.wormBinCm));
    if (b.mulchCm) add(b.id, "mulchCm", int(b.mulchCm));
  }
  for (const c of h.cells) {
    add(c.id, "a", p("PlantingCell"));
    add(c.id, "inBed", namedNode(c.bedId));
    add(c.id, "row", int(c.row)); add(c.id, "col", int(c.col));
    add(c.id, "grows", namedNode(CROP_IRI + c.cropId));
    add(c.id, "cellStatus", p(c.status));
    if (c.depthMm !== undefined) add(c.id, "cellSowingDepthMm", int(c.depthMm));
    if (c.seeds !== undefined) add(c.id, "cellSeedsPerPoint", int(c.seeds));
    if (c.sownOn) add(c.id, "sownOn", literal(c.sownOn, namedNode(XSD + "date")));
  }
  for (const g of h.plants) {
    add(g.id, "a", p("GardenPlant")); name(g.id, g.name);
    add(g.id, "inZone", namedNode(g.zoneId));
    add(g.id, "grows", namedNode(CROP_IRI + g.cropId));
    if (g.plantedYear !== undefined) add(g.id, "plantedYear", int(g.plantedYear));
    if (g.rootstock) add(g.id, "rootstock", literal(g.rootstock));
    if (g.xM !== undefined) add(g.id, "xM", dec(g.xM));
    if (g.yM !== undefined) add(g.id, "yM", dec(g.yM));
  }
  // The household's own recipes: schema:Recipe, each line a node of its own under the recipe's IRI.
  const S = (local: string) => namedNode(SCHEMA + local);
  for (const r of h.recipes ?? []) {
    const id = namedNode(r.id);
    qs.push(quad(id, namedNode(RDF_TYPE), S("Recipe")));
    for (const [lang, text] of Object.entries(r.names)) if (text) qs.push(quad(id, S("name"), literal(text, lang)));
    if (r.yield) qs.push(quad(id, S("recipeYield"), literal(r.yield)));
    if (r.description) qs.push(quad(id, S("description"), literal(r.description)));
    if (r.steps?.length) qs.push(quad(id, S("recipeInstructions"), literal(r.steps.join("\n"))));
    if (r.keepsAs) qs.push(quad(id, p("preservesAs"), p(r.keepsAs)));
    r.lines.forEach((l, i) => {
      const line = namedNode(`${r.id}/line-${i + 1}`);
      qs.push(quad(id, p("usesIngredient"), line), quad(line, S("name"), literal(l.text)));
      if (l.cropId) {
        qs.push(quad(line, p("crop"), namedNode(CROP_IRI + l.cropId)), quad(line, p("part"), p(l.part ?? "Leaf")));
        for (const m of l.methods ?? []) qs.push(quad(line, p("acceptsMethod"), p(m)));
      }
    });
  }
  // The guilds' water (docs/adr/0025).
  for (const c of h.catchments ?? []) {
    add(c.id, "a", p("RainCatchment")); name(c.id, c.name);
    add(c.id, "inGuild", namedNode(c.guildId));
    if (c.zoneId) add(c.id, "inZone", namedNode(c.zoneId));
    add(c.id, "catchmentM2", dec(c.m2));
    if (c.runoff !== undefined) add(c.id, "runoffShare", dec(c.runoff));
    add(c.id, "drainsTo", namedNode(c.storeId));
  }
  for (const w of h.stores ?? []) {
    add(w.id, "a", p("WaterStore")); name(w.id, w.name);
    add(w.id, "inGuild", namedNode(w.guildId));
    if (w.zoneId) add(w.id, "inZone", namedNode(w.zoneId));
    add(w.id, "storeKind", p(w.kind));
    if (w.capacityL !== undefined) add(w.id, "capacityL", dec(w.capacityL));
    for (const k of w.holds) add(w.id, "holds", p(k));
    if (w.overflowTo) add(w.id, "overflowTo", namedNode(w.overflowTo));
  }
  for (const v of h.valves ?? []) {
    add(v.id, "a", p("Valve")); name(v.id, v.name);
    add(v.id, "inGuild", namedNode(v.guildId));
    add(v.id, "flowFrom", namedNode(v.from)); add(v.id, "flowTo", namedNode(v.to));
    add(v.id, "valveKind", p(v.kind));
  }
  // What the habitat is learning (docs/adr/0026): cycles, their hypotheses and measures, and the checks (sosa:Observation).
  const texts = (s: string, pr: string, t: Texts | undefined) => {
    for (const [lang, text] of Object.entries(t ?? {})) if (text) qs.push(quad(namedNode(s), namedNode(pr), literal(text, lang)));
  };
  const written = new Set<string>();
  for (const c of h.cycles ?? []) {
    add(c.id, "a", p("LearningCycle")); texts(c.id, LABEL, c.name);
    add(c.id, "about", namedNode(c.aboutId));
    add(c.id, "cyclePhase", p(c.phase));
    if (c.startedOn) add(c.id, "startedOn", literal(c.startedOn, namedNode(XSD + "date")));
    if (c.endsOn) add(c.id, "endsOn", literal(c.endsOn, namedNode(XSD + "date")));
    if (c.starter) add(c.id, "fromStarter", literal(c.starter));
    for (const m of c.measures) {
      if (written.has(m.id)) continue;
      written.add(m.id);
      add(m.id, "a", p("Measure")); texts(m.id, LABEL, m.label);
      if (m.code) add(m.id, "code", literal(m.code));
      texts(m.id, PERMA + "method", m.method);
      if (m.everyDays !== undefined) add(m.id, "everyDays", int(m.everyDays));
      if (m.reading) add(m.id, "reading", literal(m.reading));
    }
    for (const x of c.hypotheses) {
      add(c.id, "hasHypothesis", namedNode(x.id));
      add(x.id, "a", p("Hypothesis")); texts(x.id, LABEL, x.label); texts(x.id, COMMENT, x.why);
      if (x.code) add(x.id, "code", literal(x.code));
      add(x.id, "expected", dec(x.expected)); add(x.id, "low", dec(x.low)); add(x.id, "high", dec(x.high));
      add(x.id, "unit", literal(x.unit));
      if (x.source) add(x.id, "source", literal(x.source));
      add(x.id, "measuredBy", namedNode(x.measureId));
      if (x.verdict) add(x.id, "verdict", p(x.verdict));
      if (x.actTaken) add(x.id, "actTaken", literal(x.actTaken));
    }
    for (const k of c.checks) {
      add(k.id, "a", p("Check"));
      add(k.id, "ofHypothesis", namedNode(k.hypothesisId));
      qs.push(quad(namedNode(k.id), namedNode(SOSA + "hasSimpleResult"), dec(k.value)));
      qs.push(quad(namedNode(k.id), namedNode(SOSA + "resultTime"), literal(k.on, namedNode(XSD + "date"))));
      if (k.by) add(k.id, "checkedBy", literal(k.by));
    }
  }
  if (h.rest.trim()) qs.push(...new N3.Parser({ format: "N-Triples" }).parse(h.rest));
  return new Promise((resolve, reject) => {
    const w = new N3.Writer({ prefixes: PREFIXES });
    w.addQuads(qs);
    w.end((err, out) => (err ? reject(err) : resolve(out)));
  });
}

const CLASSES = ["GardenZone", "Guild", "GrowingBed", "PlantingCell", "GardenPlant", "RainCatchment", "WaterStore", "Valve",
  "LearningCycle", "Hypothesis", "Measure", "Check"].map((c) => PERMA + c);

export function habitatFromTtl(ttl: string): Habitat {
  const store = new N3.Store(ttl.trim() ? new N3.Parser().parse(ttl) : []);
  const one = (s: string, pr: string) => store.getObjects(namedNode(s), p(pr), null)[0];
  const str = (s: string, pr: string) => one(s, pr)?.value;
  const num = (s: string, pr: string) => { const v = one(s, pr)?.value; return v === undefined ? undefined : Number(v); };
  const local = (t: Term | undefined) => t?.value.startsWith(PERMA) ? t.value.slice(PERMA.length) : undefined;
  const label = (s: string) => store.getObjects(namedNode(s), namedNode(LABEL), null)[0]?.value ?? "";
  const ofType = (c: string) => store.getSubjects(namedNode(RDF_TYPE), p(c), null).map((x) => x.value).sort();
  const crop = (s: string) => (str(s, "grows") ?? "").slice(CROP_IRI.length);

  const zones: Zone[] = ofType("GardenZone").map((id) => ({
    id, name: label(id),
    kind: (ZONE_KINDS as string[]).includes(local(one(id, "zoneKind")) ?? "") ? (local(one(id, "zoneKind")) as ZoneKind) : "GroundZone",
    exposure: store.getObjects(namedNode(id), p("exposure"), null).map(local)
      .filter((e): e is Exposure => (EXPOSURES as string[]).includes(e ?? "")).sort(),
    ...(num(id, "areaM2") !== undefined && { areaM2: num(id, "areaM2") }),
    ...(num(id, "microclimateOffsetC") !== undefined && { offsetC: num(id, "microclimateOffsetC") }),
  }));
  const guilds: Guild[] = ofType("Guild").map((id) => ({
    id, name: label(id), zoneId: str(id, "inZone") ?? "",
    type: (GUILD_TYPES as string[]).includes(local(one(id, "guildType")) ?? "") ? (local(one(id, "guildType")) as GuildType) : "WormBed5",
    ...(local(one(id, "robotModel")) === "Gantry5Gen1" && { robot: "Gantry5Gen1" as RobotModel }),
    ...(str(id, "wormsMayLeave") !== undefined && { wormsMayLeave: str(id, "wormsMayLeave") === "true" }),
  }));
  const beds: Bed[] = ofType("GrowingBed").map((id) => ({
    id, name: label(id), zoneId: str(id, "inZone") ?? "",
    ...(str(id, "inGuild") && { guildId: str(id, "inGuild") }),
    lengthCm: num(id, "lengthCm") ?? 0, widthCm: num(id, "widthCm") ?? 0,
    ...(num(id, "substrateDepthCm") !== undefined && { depthCm: num(id, "substrateDepthCm") }),
    cellCm: num(id, "cellSizeCm") ?? 10,
    ...((SUBSTRATE_KINDS as string[]).includes(local(one(id, "substrateKind")) ?? "") && { substrate: local(one(id, "substrateKind")) as SubstrateKind }),
    ...(num(id, "tankPipeCount") !== undefined && { tankPipes: num(id, "tankPipeCount") }),
    ...(num(id, "tankPipeMm") !== undefined && { tankPipeMm: num(id, "tankPipeMm") }),
    ...(num(id, "wormBinCm") !== undefined && { wormBinCm: num(id, "wormBinCm") }),
    ...(num(id, "mulchCm") && { mulchCm: num(id, "mulchCm") }),
  }));
  const cells: Cell[] = ofType("PlantingCell").map((id) => ({
    id, bedId: str(id, "inBed") ?? "", row: num(id, "row") ?? 0, col: num(id, "col") ?? 0, cropId: crop(id),
    status: (CELL_STATUSES as string[]).includes(local(one(id, "cellStatus")) ?? "") ? (local(one(id, "cellStatus")) as CellStatus) : "CellPlanned",
    ...(str(id, "sownOn") && { sownOn: str(id, "sownOn") }),
    ...(num(id, "cellSowingDepthMm") !== undefined && { depthMm: num(id, "cellSowingDepthMm") }),
    ...(num(id, "cellSeedsPerPoint") !== undefined && { seeds: num(id, "cellSeedsPerPoint") }),
  }));
  const plants: GardenPlant[] = ofType("GardenPlant").map((id) => ({
    id, name: label(id), zoneId: str(id, "inZone") ?? "", cropId: crop(id),
    ...(num(id, "plantedYear") !== undefined && { plantedYear: num(id, "plantedYear") }),
    ...(str(id, "rootstock") && { rootstock: str(id, "rootstock") }),
    ...(num(id, "xM") !== undefined && { xM: num(id, "xM") }),
    ...(num(id, "yM") !== undefined && { yM: num(id, "yM") }),
  }));

  const of = <T extends string>(t: Term | undefined, all: T[], fallback: T): T => ((all as string[]).includes(local(t) ?? "") ? (local(t) as T) : fallback);
  const catchments: RainCatchment[] = ofType("RainCatchment").map((id) => ({
    id, name: label(id), guildId: str(id, "inGuild") ?? "",
    ...(str(id, "inZone") && { zoneId: str(id, "inZone") }),
    m2: num(id, "catchmentM2") ?? 0,
    ...(num(id, "runoffShare") !== undefined && { runoff: num(id, "runoffShare") }),
    storeId: str(id, "drainsTo") ?? "",
  }));
  const stores: WaterStore[] = ofType("WaterStore").map((id) => ({
    id, name: label(id), guildId: str(id, "inGuild") ?? "",
    ...(str(id, "inZone") && { zoneId: str(id, "inZone") }),
    kind: of<StoreKind>(one(id, "storeKind"), STORE_KINDS, "RainBarrel"),
    ...(num(id, "capacityL") !== undefined && { capacityL: num(id, "capacityL") }),
    holds: store.getObjects(namedNode(id), p("holds"), null).map(local).filter((k): k is WaterKind => (WATER_KINDS as string[]).includes(k ?? "")).sort(),
    ...(str(id, "overflowTo") && { overflowTo: str(id, "overflowTo") }),
  }));
  const valves: Valve[] = ofType("Valve").map((id) => ({
    id, name: label(id), guildId: str(id, "inGuild") ?? "", from: str(id, "flowFrom") ?? "", to: str(id, "flowTo") ?? "",
    kind: of<ValveKind>(one(id, "valveKind"), VALVE_KINDS, "ManualTap"),
  }));

  const texts = (s: string, pr: string): Texts => {
    const out: Texts = {};
    for (const o of store.getObjects(namedNode(s), namedNode(pr), null)) out[((o as { language?: string }).language || "en") as Lang] = o.value;
    return out;
  };
  const measureOf = (id: string): Measure => ({
    id, label: texts(id, LABEL),
    ...(str(id, "code") && { code: str(id, "code") }),
    ...(Object.keys(texts(id, PERMA + "method")).length && { method: texts(id, PERMA + "method") }),
    ...(num(id, "everyDays") !== undefined && { everyDays: num(id, "everyDays") }),
    ...(str(id, "reading") && { reading: str(id, "reading") }),
  });
  const cycles: LearningCycle[] = ofType("LearningCycle").map((id) => {
    const hypIds = store.getObjects(namedNode(id), p("hasHypothesis"), null).map((x) => x.value);
    const hypotheses: Hypothesis[] = hypIds.map((hid) => ({
      id: hid, label: texts(hid, LABEL),
      ...(Object.keys(texts(hid, COMMENT)).length && { why: texts(hid, COMMENT) }),
      ...(str(hid, "code") && { code: str(hid, "code") }),
      expected: num(hid, "expected") ?? 0, low: num(hid, "low") ?? 0, high: num(hid, "high") ?? 0, unit: str(hid, "unit") ?? "",
      ...(str(hid, "source") && { source: str(hid, "source") }),
      measureId: str(hid, "measuredBy") ?? "",
      ...(local(one(hid, "verdict")) && { verdict: of<Verdict>(one(hid, "verdict"), VERDICTS, "VerdictOpen") }),
      ...(str(hid, "actTaken") && { actTaken: str(hid, "actTaken") }),
    })).sort((a, b) => (a.code ?? a.id).localeCompare(b.code ?? b.id, undefined, { numeric: true }));
    const measureIds = [...new Set(hypotheses.map((x) => x.measureId).filter(Boolean))];
    const hypSet = new Set(hypIds);
    const checks: Check[] = ofType("Check").filter((k) => hypSet.has(str(k, "ofHypothesis") ?? "")).map((k) => {
      const by = str(k, "checkedBy") as Check["by"] | string | undefined;
      return {
        id: k, hypothesisId: str(k, "ofHypothesis") ?? "",
        value: Number(store.getObjects(namedNode(k), namedNode(SOSA + "hasSimpleResult"), null)[0]?.value ?? NaN),
        on: store.getObjects(namedNode(k), namedNode(SOSA + "resultTime"), null)[0]?.value ?? "",
        ...((by === "person" || by === "edge") && { by: by as Check["by"] }),
      };
    }).sort((a, b) => a.on.localeCompare(b.on));
    return {
      id, name: texts(id, LABEL), aboutId: str(id, "about") ?? "",
      phase: of<Phase>(one(id, "cyclePhase"), PHASES, "PlanPhase"),
      ...(str(id, "startedOn") && { startedOn: str(id, "startedOn") }),
      ...(str(id, "endsOn") && { endsOn: str(id, "endsOn") }),
      ...(str(id, "fromStarter") && { starter: str(id, "fromStarter") }),
      hypotheses, measures: measureIds.filter((m) => store.getQuads(namedNode(m), null, null, null).length).map(measureOf).sort((a, b) => (a.code ?? a.id).localeCompare(b.code ?? b.id, undefined, { numeric: true })),
      checks,
    };
  });

  const S = (local: string) => namedNode(SCHEMA + local);
  const recipeIds = store.getSubjects(namedNode(RDF_TYPE), S("Recipe"), null).filter((s) => s.termType === "NamedNode").map((s) => s.value).sort();
  const lineIds = new Set<string>();
  const recipes: Recipe[] = recipeIds.map((id) => {
    const node = namedNode(id);
    const text = (pr: string) => store.getObjects(node, S(pr), null)[0]?.value;
    const names: Recipe["names"] = {};
    for (const n of store.getObjects(node, S("name"), null)) {
      const lang = ((n as { language?: string }).language || "en") as keyof Recipe["names"];
      names[lang] = n.value;
    }
    const lines: RecipeLine[] = store.getObjects(node, p("usesIngredient"), null)
      .filter((l) => l.termType === "NamedNode").map((l) => l.value)
      .sort((a, b) => Number(a.split("/line-")[1] ?? 0) - Number(b.split("/line-")[1] ?? 0))
      .map((line) => {
        lineIds.add(line);
        const cropIri = one(line, "crop")?.value;
        return {
          text: store.getObjects(namedNode(line), S("name"), null)[0]?.value ?? "",
          ...(cropIri && {
            cropId: cropIri.slice(CROP_IRI.length), part: local(one(line, "part")),
            methods: store.getObjects(namedNode(line), p("acceptsMethod"), null).map(local).filter((m): m is string => !!m).sort(),
          }),
        };
      });
    return {
      id, names, lines,
      ...(text("recipeYield") && { yield: text("recipeYield") }),
      ...(text("description") && { description: text("description") }),
      ...(text("recipeInstructions") && { steps: text("recipeInstructions")!.split("\n") }),
      ...(local(one(id, "preservesAs")) && { keepsAs: local(one(id, "preservesAs")) }),
    };
  });

  // Everything not about these subjects stays as it was.
  const mine = new Set([...CLASSES.flatMap((c) => store.getSubjects(namedNode(RDF_TYPE), namedNode(c), null).map((x) => x.value)), ...recipeIds, ...lineIds]);
  const rest = store.getQuads(null, null, null, null).filter((q) => !mine.has(q.subject.value));
  const writer = new N3.Writer({ format: "N-Triples" });
  return {
    zones, guilds, beds, cells, plants, ...(recipes.length > 0 && { recipes }),
    ...(catchments.length > 0 && { catchments }), ...(stores.length > 0 && { stores }), ...(valves.length > 0 && { valves }),
    ...(cycles.length > 0 && { cycles }),
    rest: rest.length ? writer.quadsToString(rest) : "",
  };
}
