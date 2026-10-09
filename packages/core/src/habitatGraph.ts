/**
 * A habitat <-> its A-Box in Turtle (the shared space's graph, ADR-0007).
 *
 * Reads what the habitat module knows (zones, beds, cells, garden plants) and
 * keeps every other triple untouched in `rest`, so a save from the app never
 * drops what an edge or another tool wrote into the same graph.
 */
import N3 from "n3";
import type { Quad, Term } from "n3";
import { CROP_IRI } from "./library.js";
import {
  CELL_STATUSES, EXPOSURES, ZONE_KINDS,
  type Bed, type Cell, type CellStatus, type Exposure, type GardenPlant, type Habitat, type Zone, type ZoneKind,
} from "./habitatModel.js";

const { namedNode, literal, quad } = N3.DataFactory;
const PERMA = "https://permaculture.digitalhome.cloud/ontology#";
const RDF_TYPE = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";
const LABEL = "http://www.w3.org/2000/01/rdf-schema#label";
const XSD = "http://www.w3.org/2001/XMLSchema#";
const p = (local: string) => namedNode(PERMA + local);

const PREFIXES = {
  perma: PERMA,
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  xsd: XSD,
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
  for (const b of h.beds) {
    add(b.id, "a", p("GrowingBed")); name(b.id, b.name);
    add(b.id, "inZone", namedNode(b.zoneId));
    add(b.id, "lengthCm", int(b.lengthCm)); add(b.id, "widthCm", int(b.widthCm));
    if (b.depthCm !== undefined) add(b.id, "substrateDepthCm", int(b.depthCm));
    add(b.id, "cellSizeCm", int(b.cellCm));
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
  if (h.rest.trim()) qs.push(...new N3.Parser({ format: "N-Triples" }).parse(h.rest));
  return new Promise((resolve, reject) => {
    const w = new N3.Writer({ prefixes: PREFIXES });
    w.addQuads(qs);
    w.end((err, out) => (err ? reject(err) : resolve(out)));
  });
}

const CLASSES = ["GardenZone", "GrowingBed", "PlantingCell", "GardenPlant"].map((c) => PERMA + c);

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
  const beds: Bed[] = ofType("GrowingBed").map((id) => ({
    id, name: label(id), zoneId: str(id, "inZone") ?? "",
    lengthCm: num(id, "lengthCm") ?? 0, widthCm: num(id, "widthCm") ?? 0,
    ...(num(id, "substrateDepthCm") !== undefined && { depthCm: num(id, "substrateDepthCm") }),
    cellCm: num(id, "cellSizeCm") ?? 10,
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

  // Everything not about these subjects stays as it was.
  const mine = new Set(CLASSES.flatMap((c) => store.getSubjects(namedNode(RDF_TYPE), namedNode(c), null).map((x) => x.value)));
  const rest = store.getQuads(null, null, null, null).filter((q) => !mine.has(q.subject.value));
  const writer = new N3.Writer({ format: "N-Triples" });
  return { zones, beds, cells, plants, rest: rest.length ? writer.quadsToString(rest) : "" };
}
