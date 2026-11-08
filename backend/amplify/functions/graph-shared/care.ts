// /edge/v1/care (docs/adr/0031): a guild's care, as its edge reports it. The edge keeps the record (docs/adr/0024);
// the cloud runs the care calendar's rules on it (packages/core careDue, bundled) and keeps the result with the
// edge's registry row, so the site can show what is due today. A person's Done in the site waits on the row
// (`care_done_pending`) until the edge has carried it out and names it back (`applied`). The cloud never asks
// for a robot job: those are confirmed on the edge.
import * as bundled from "./planner.generated";

interface CareTask { id: string; who: string; label: Record<string, string> }
interface CareDue { task: CareTask; due: boolean; reason: string | null; nextOn: string | null; overdueDays: number }
const { careDue, CARE_GUIDE } = bundled as unknown as {
  careDue(guide: unknown, lastDone: Record<string, string>, today: string, active: readonly string[]): CareDue[];
  CARE_GUIDE: { id: string; version: number; tasks: CareTask[] };
};

/** What an edge reports. `today` is its care date: a twin runs on simulated days. */
export interface CareReport {
  spaceId: string;
  guildId: string;
  today: string;
  lastDone: Record<string, string>;
  active: string[];
  applied: string[];
}

/** What the cloud keeps with the edge, and the site shows. */
export interface CareState {
  spaceId: string;
  guildId: string;
  today: string;
  active: string[];
  due: { id: string; who: string; reason: string; overdueDays: number }[];
  guide: string;
  reportedAt: string;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[a-z0-9][a-z0-9:-]{0,63}$/;
const MAX = 64;

/** The report from a request body, or what is wrong with it. */
export function readReport(body: Record<string, unknown>): CareReport | string {
  const { spaceId, guildId, today } = body;
  if (typeof spaceId !== "string" || !spaceId) return "spaceId is required";
  if (typeof guildId !== "string" || !guildId || guildId.length > 128) return "guildId is required";
  if (typeof today !== "string" || !DAY.test(today)) return "today must be a day, YYYY-MM-DD";
  const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && ID.test(x)).slice(0, MAX) : []);
  const lastDone: Record<string, string> = {};
  if (body.lastDone && typeof body.lastDone === "object") {
    for (const [k, v] of Object.entries(body.lastDone as Record<string, unknown>).slice(0, MAX)) {
      if (ID.test(k) && typeof v === "string" && DAY.test(v)) lastDone[k] = v;
    }
  }
  return { spaceId, guildId, today, lastDone, active: ids(body.active), applied: ids(body.applied) };
}

/** What is due, by the care calendar's rules, on the edge's own date. */
export function careState(rep: CareReport, now: Date = new Date()): CareState {
  const due = careDue(CARE_GUIDE, rep.lastDone, rep.today, rep.active)
    .filter((d) => d.due)
    .map((d) => ({ id: d.task.id, who: d.task.who, reason: d.reason ?? "", overdueDays: d.overdueDays }));
  return { spaceId: rep.spaceId, guildId: rep.guildId, today: rep.today, active: rep.active, due,
    guide: `${CARE_GUIDE.id}@${CARE_GUIDE.version}`, reportedAt: now.toISOString() };
}

/** The Done presses still waiting for the edge, once it named the ones it carried out. */
export const stillPending = (pending: Iterable<string> | undefined, applied: readonly string[]) =>
  [...(pending ?? [])].filter((id) => !applied.includes(id)).sort();

/** Only a person's task can be done from the site; the robot's are done by its jobs, on the edge. */
export const isPersonTask = (id: string) => CARE_GUIDE.tasks.some((t) => t.id === id && t.who === "person");
