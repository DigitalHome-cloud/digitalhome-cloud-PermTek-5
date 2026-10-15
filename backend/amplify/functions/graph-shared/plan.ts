// /edge/v1/plan (docs/adr/0027): the cloud's bed planner, for an edge's agent. It reads the space's graph,
// plans a bed or a farm of beds from plant sets, and returns the planting WITHOUT saving it: the edge shows
// it as a proposal, a person confirms, and the edge writes the cells through /graphs/put like any edit.
// Without sets it answers what can be planned: the beds, the farms and the plant sets (library and own).
import * as bundled from "./planner.generated";

// The bundle is plain JavaScript: these are the shapes of what plan.ts uses (packages/core has the full types).
interface Placement { row: number; col: number; cropId: string }
interface Bed { id: string; name: string; lengthCm: number; widthCm: number; cellCm: number; guildId?: string; farmId?: string }
interface Cell { id: string; bedId: string; row: number; col: number; cropId: string }
interface PlantSet { id: string; names: Record<string, string>; members: { cropId: string; share: number }[]; draft?: boolean }
interface SetChoice { setId: string; share: number }
interface SetPlan { cells: Placement[]; crops: unknown[]; sets: unknown[]; goodPairs: number; badPairs: number; cover: number }
interface Habitat { beds: Bed[]; cells: Cell[]; farms?: { id: string; name: string }[]; plantSets?: PlantSet[] }
const { habitatFromTtl, planFarm, planFromSets, plantSets, setName } = bundled as unknown as {
  habitatFromTtl(ttl: string): Habitat;
  planFromSets(bed: Bed, choices: SetChoice[], existing: Cell[], opts: { seed: number }, own: PlantSet[]): SetPlan;
  planFarm(beds: Bed[], choices: SetChoice[], existing: Cell[], opts: { seed: number }, own: PlantSet[]): { bedId: string; choices: SetChoice[]; plan: SetPlan }[];
  plantSets(): PlantSet[];
  setName(s: PlantSet, lang: string): string;
};

export interface PlanRequest { bedId?: string; farmId?: string; sets?: { setId: string; share: number }[]; seed?: number }

const short = (iri: string) => iri.slice(iri.lastIndexOf("/") + 1);

export function planForEdge(ttl: string, req: PlanRequest): { status: number; body: Record<string, unknown> } {
  const h = habitatFromTtl(ttl);
  const own = h.plantSets ?? [];
  const sets = [...plantSets(), ...own].map((s) => ({
    id: s.id, name: setName(s, "en"), names: s.names, draft: !!s.draft, members: s.members,
  }));
  if (!req.sets?.length) {
    return { status: 200, body: {
      beds: h.beds.map((b) => ({ id: b.id, name: b.name, lengthCm: b.lengthCm, widthCm: b.widthCm, cellCm: b.cellCm,
        guildId: b.guildId ?? null, farmId: b.farmId ?? null, planted: h.cells.filter((c) => c.bedId === b.id).length })),
      farms: (h.farms ?? []).map((f) => ({ id: f.id, name: f.name, beds: h.beds.filter((b) => b.farmId === f.id).length })),
      sets,
    } };
  }
  const known = new Set(sets.map((s) => s.id));
  const unknown = req.sets.filter((s) => !known.has(s.setId)).map((s) => s.setId);
  if (unknown.length) return { status: 400, body: { error: "invalid_request", message: `no such plant set: ${unknown.join(", ")}` } };
  const choices = req.sets.map((s) => ({ setId: s.setId, share: Math.max(0, Math.min(5, Number(s.share) || 1)) }));
  const opts = { seed: Number.isInteger(req.seed) ? Number(req.seed) : 5 };
  const find = <T extends { id: string }>(id: string | undefined, list: T[]): T | undefined => list.find((x) => x.id === id || short(x.id) === id);
  const farm = find(req.farmId, h.farms ?? []);
  const bed = find(req.bedId, h.beds);
  if (!farm && !bed) return { status: 404, body: { error: "not_found", message: "name a bedId or a farmId of this space" } };
  const out = farm
    ? planFarm(h.beds.filter((b) => b.farmId === farm.id), choices, h.cells, opts, own)
    : [{ bedId: bed!.id, choices, plan: planFromSets(bed!, choices, h.cells, opts, own) }];
  return { status: 200, body: {
    proposal: true, saved: false,
    plans: out.map(({ bedId, choices: c, plan }) => ({
      bedId, bed: h.beds.find((b) => b.id === bedId)?.name, sets: c,
      cells: plan.cells, crops: plan.crops, perSet: plan.sets,
      goodPairs: plan.goodPairs, badPairs: plan.badPairs, cover: plan.cover,
    })),
  } };
}
