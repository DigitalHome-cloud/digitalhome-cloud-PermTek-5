/**
 * The habitat's second brain (docs/adr/0026): learning cycles about a guild, plan-do-check-act. A cycle holds
 * hypotheses (a number expected and the range in which it holds), the measures that test them, and the checks:
 * one measured number on a day, by a person or an edge (a sosa:Observation in the graph).
 *
 *   adoptStarter(guide, guildId, today)   a starter set (guides/wormbed5-sizing.json) as a cycle in its Plan phase
 *   verdict(h, checks, final)             Open, Holds or Fails, by the starter's rule
 *   nextPhase(phase)                      Plan -> Do -> Check -> Act
 *   checksDue(cycle, today)               the measures whose time has come
 *   nextCycle(cycle, today)               a new cycle in Plan with the same hypotheses, the act's numbers in them
 *
 * Pure functions over plain data.
 */
import { newId } from "./habitatModel.js";

export type Lang = "en" | "de" | "fr";
export type Texts = Partial<Record<Lang, string>>;
export type Phase = "PlanPhase" | "DoPhase" | "CheckPhase" | "ActPhase";
export const PHASES: Phase[] = ["PlanPhase", "DoPhase", "CheckPhase", "ActPhase"];
export type Verdict = "VerdictOpen" | "VerdictHolds" | "VerdictFails";
export const VERDICTS: Verdict[] = ["VerdictOpen", "VerdictHolds", "VerdictFails"];

export interface Measure { id: string; code?: string; label: Texts; method?: Texts; everyDays?: number; reading?: string }
export interface Hypothesis {
  id: string; code?: string; label: Texts; why?: Texts;
  expected: number; low: number; high: number; unit: string; source?: string;
  measureId: string; verdict?: Verdict; actTaken?: string;
}
export interface Check { id: string; hypothesisId: string; value: number; on: string; by?: "person" | "edge" }
export interface LearningCycle {
  id: string; name: Texts; aboutId: string; phase: Phase; startedOn?: string; endsOn?: string; starter?: string;
  hypotheses: Hypothesis[]; measures: Measure[]; checks: Check[];
}

/** A text in a language, else English, else any. */
export const say = (t: Texts | undefined, lang: string): string => (t && (t[lang as Lang] ?? t.en ?? Object.values(t)[0])) ?? "";

const DAY_MS = 86_400_000;
const day = (d: Date | string) => (typeof d === "string" ? new Date(`${d}T00:00:00`) : new Date(d.getFullYear(), d.getMonth(), d.getDate()));
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);   // calendar days: no clock change

/** The shape of a starter set as packages/ontology/guides/*.json writes it. */
export interface StarterGuide {
  id: string; title: Texts; days?: number;
  hypotheses: readonly { code: string; measure: string; expected: number; low: number; high: number; unit: string; label: Texts; why?: Texts; source?: string }[];
  measures: readonly { code: string; everyDays?: number; reading?: string; label: Texts; method?: Texts }[];
}

/** A starter set as a new cycle about a guild, in its Plan phase, from today for the starter's days. */
export function adoptStarter(guide: StarterGuide, guildId: string, today: Date | string = new Date()): LearningCycle {
  const start = day(today);
  const measures: Measure[] = guide.measures.map((m) => ({
    id: newId("measure"), code: m.code, label: { ...m.label }, ...(m.method && { method: { ...m.method } }),
    ...(m.everyDays && { everyDays: m.everyDays }), ...(m.reading && { reading: m.reading }),
  }));
  const byCode = new Map(measures.map((m) => [m.code, m.id]));
  return {
    id: newId("cycle"), name: { ...guide.title }, aboutId: guildId, phase: "PlanPhase", starter: guide.id,
    startedOn: iso(start), endsOn: iso(addDays(start, guide.days ?? 365)),
    measures,
    hypotheses: guide.hypotheses.map((h) => ({
      id: newId("hyp"), code: h.code, label: { ...h.label }, ...(h.why && { why: { ...h.why } }),
      expected: h.expected, low: h.low, high: h.high, unit: h.unit, ...(h.source && { source: h.source }),
      measureId: byCode.get(h.measure) ?? measures[0]?.id ?? "", verdict: "VerdictOpen" as Verdict,
    })),
    checks: [],
  };
}

const inside = (h: Hypothesis, v: number) => v >= h.low && v <= h.high;

/**
 * How a hypothesis stands after its checks: Holds while the last check lies in its range; Fails when two checks
 * running lie outside it, or (`final`, the season is over) the last one does; Open with no checks, or after one
 * check outside (watch it).
 */
export function verdict(h: Hypothesis, checks: Check[], final = false): Verdict {
  const mine = checks.filter((c) => c.hypothesisId === h.id).sort((a, b) => a.on.localeCompare(b.on));
  if (!mine.length) return "VerdictOpen";
  const last = mine[mine.length - 1], before = mine[mine.length - 2];
  if (inside(h, last.value)) return "VerdictHolds";
  if ((before && !inside(h, before.value)) || final) return "VerdictFails";
  return "VerdictOpen";
}

export const nextPhase = (p: Phase): Phase => PHASES[Math.min(PHASES.length - 1, PHASES.indexOf(p) + 1)];

/** The measures whose time has come: never checked yet, or as long ago as their rhythm. Only while measuring (Do, Check). */
export function checksDue(c: LearningCycle, today: Date | string = new Date()): { measure: Measure; lastOn: string | null; dueOn: string }[] {
  if (c.phase !== "DoPhase" && c.phase !== "CheckPhase") return [];
  const now = day(today);
  return c.measures.flatMap((m) => {
    const hyps = new Set(c.hypotheses.filter((h) => h.measureId === m.id).map((h) => h.id));
    const last = c.checks.filter((k) => hyps.has(k.hypothesisId)).map((k) => k.on).sort().pop() ?? null;
    const dueOn = last ? addDays(day(last), m.everyDays ?? 30) : day(c.startedOn ?? iso(now));
    return dueOn.getTime() <= now.getTime() + DAY_MS / 2 ? [{ measure: m, lastOn: last, dueOn: iso(dueOn) }] : [];
  });
}

/**
 * The next turn: a new cycle in Plan about the same guild, with the same measures and hypotheses. A hypothesis
 * keeps its numbers, which the Act phase has already set to what was learned; its verdict, its act note and the
 * checks start afresh.
 */
export function nextCycle(c: LearningCycle, today: Date | string = new Date(), nameSuffix: Texts = { en: "next", de: "nächster", fr: "suivant" }): LearningCycle {
  const start = day(today);
  const measureIds = new Map(c.measures.map((m) => [m.id, newId("measure")]));
  const span = c.startedOn && c.endsOn ? Math.round((day(c.endsOn).getTime() - day(c.startedOn).getTime()) / DAY_MS) : 365;
  const name: Texts = {};
  for (const [l, t] of Object.entries(c.name)) name[l as Lang] = `${t} (${nameSuffix[l as Lang] ?? nameSuffix.en})`;
  return {
    id: newId("cycle"), name, aboutId: c.aboutId, phase: "PlanPhase", ...(c.starter && { starter: c.starter }),
    startedOn: iso(start), endsOn: iso(addDays(start, span)),
    measures: c.measures.map((m) => ({ ...m, id: measureIds.get(m.id)! })),
    hypotheses: c.hypotheses.map(({ actTaken: _act, ...h }) => ({ ...h, id: newId("hyp"), measureId: measureIds.get(h.measureId) ?? h.measureId, verdict: "VerdictOpen" as Verdict })),
    checks: [],
  };
}
