// /edge/v1/plan (docs/adr/0027): the cloud's bed planner, for an edge's agent. It reads the space's graph,
// plans a bed or a farm of beds from plant sets, and returns the planting WITHOUT saving it: the edge shows
// it as a proposal, a person confirms, and the edge writes the cells through /graphs/put like any edit.
// Without sets it answers what can be planned: the beds with their periods, the farms and the plant sets.
// A bed with growing periods (docs/adr/0029) plans one of them: `periodId`, or the one `month` lies in; the cells
// come back with that period, and what the period already holds stays.
import * as bundled from "./planner.generated";

// The bundle is plain JavaScript: these are the shapes of what plan.ts uses (packages/core has the full types).
interface Placement { row: number; col: number; cropId: string }
interface Bed { id: string; name: string; lengthCm: number; widthCm: number; cellCm: number; guildId?: string; farmId?: string }
interface Cell { id: string; bedId: string; row: number; col: number; cropId: string; periodId?: string }
interface Period { id: string; bedId: string; name: string; kind: string; fromMonth: number; toMonth: number; sets: SetChoice[] }
interface PlantSet { id: string; names: Record<string, string>; about?: Record<string, string>; members: { cropId: string; share: number }[]; draft?: boolean }
interface SetChoice { setId: string; share: number }
interface SetPlan { cells: Placement[]; crops: unknown[]; sets: unknown[]; goodPairs: number; badPairs: number; cover: number }
interface Habitat { beds: Bed[]; cells: Cell[]; farms?: { id: string; name: string }[]; plantSets?: PlantSet[]; periods?: Period[] }
const { habitatFromTtl, periodAt, periodsOf, planFarm, planFromSets, plantSets, setName } = bundled as unknown as {
  habitatFromTtl(ttl: string): Habitat;
  planFromSets(bed: Bed, choices: SetChoice[], existing: Cell[], opts: { seed: number }, own: PlantSet[]): SetPlan;
  planFarm(beds: Bed[], choices: SetChoice[], existing: Cell[], opts: { seed: number; same?: boolean }, own: PlantSet[]): { bedId: string; choices: SetChoice[]; plan: SetPlan }[];
  plantSets(): PlantSet[];
  setName(s: PlantSet, lang: string): string;
  periodAt(h: Habitat, bedId: string, month: number): Period | undefined;
  periodsOf(h: Habitat, bedId: string): Period[];
};

/** `same`: a farm plants every bed from all the sets, instead of sharing them out (docs/adr/0028). */
export interface PlanRequest {
  bedId?: string; farmId?: string; sets?: { setId: string; share: number }[]; seed?: number; same?: boolean;
  periodId?: string; month?: number;
}

const short = (iri: string) => iri.slice(iri.lastIndexOf("/") + 1);

export function planForEdge(ttl: string, req: PlanRequest): { status: number; body: Record<string, unknown> } {
  const h = habitatFromTtl(ttl);
  const own = h.plantSets ?? [];
  const sets = [...plantSets(), ...own].map((s) => ({
    id: s.id, name: setName(s, "en"), names: s.names, about: s.about?.en ?? "", draft: !!s.draft, members: s.members,
  }));
  if (!req.sets?.length) {
    return { status: 200, body: {
      beds: h.beds.map((b) => ({ id: b.id, name: b.name, lengthCm: b.lengthCm, widthCm: b.widthCm, cellCm: b.cellCm,
        guildId: b.guildId ?? null, farmId: b.farmId ?? null, planted: h.cells.filter((c) => c.bedId === b.id).length,
        periods: periodsOf(h, b.id).map((p) => ({ id: p.id, name: p.name, kind: p.kind, fromMonth: p.fromMonth, toMonth: p.toMonth, sets: p.sets,
          planted: h.cells.filter((c) => c.periodId === p.id).length })) })),
      farms: (h.farms ?? []).map((f) => ({ id: f.id, name: f.name, beds: h.beds.filter((b) => b.farmId === f.id).length })),
      sets,
    } };
  }
  const known = new Set(sets.map((s) => s.id));
  const unknown = req.sets.filter((s) => !known.has(s.setId)).map((s) => s.setId);
  if (unknown.length) return { status: 400, body: { error: "invalid_request", message: `no such plant set: ${unknown.join(", ")}` } };
  const choices = req.sets.map((s) => ({ setId: s.setId, share: Math.max(0, Math.min(5, Number(s.share) || 1)) }));
  const opts = { seed: Number.isInteger(req.seed) ? Number(req.seed) : 5, same: req.same === true };
  const find = <T extends { id: string }>(id: string | undefined, list: T[]): T | undefined => list.find((x) => x.id === id || short(x.id) === id);
  const farm = find(req.farmId, h.farms ?? []);
  const bed = find(req.bedId, h.beds);
  if (!farm && !bed) return { status: 404, body: { error: "not_found", message: "name a bedId or a farmId of this space" } };
  // the period each bed plans; without one, the bed as it stands
  const month = Number.isInteger(req.month) && req.month! >= 1 && req.month! <= 12 ? req.month! : undefined;
  const periodOf = (b: Bed) => (h.periods ?? []).find((p) => p.bedId === b.id && (p.id === req.periodId || short(p.id) === req.periodId))
    ?? (month ? periodAt(h, b.id, month) : undefined);
  const beds = farm ? h.beds.filter((b) => b.farmId === farm.id) : [bed!];
  const existing = h.cells.filter((c) => beds.some((b) => b.id === c.bedId && (c.periodId ?? "") === (periodOf(b)?.id ?? "")));
  const out = farm
    ? planFarm(beds, choices, existing, opts, own)
    : [{ bedId: bed!.id, choices, plan: planFromSets(bed!, choices, existing, opts, own) }];
  return { status: 200, body: {
    proposal: true, saved: false,
    plans: out.map(({ bedId, choices: c, plan }) => ({
      bedId, bed: h.beds.find((b) => b.id === bedId)?.name, sets: c,
      periodId: periodOf(h.beds.find((b) => b.id === bedId)!)?.id ?? null,
      cells: plan.cells, crops: plan.crops, perSet: plan.sets,
      goodPairs: plan.goodPairs, badPairs: plan.badPairs, cover: plan.cover,
    })),
  } };
}
