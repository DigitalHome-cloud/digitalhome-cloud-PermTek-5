/**
 * The care calendar: what keeps a guild working, and who does it (docs/adr/0024).
 *
 * The tasks are data (packages/ontology/guides/wormbed5-care.json, exported as
 * CARE_GUIDE). Each has a RHYTHM in days ("every 7 days"), or MONTHS of the
 * year ("October and November"), or both. A task falls due when its rhythm has
 * run out since it was last done, or when one of its months begins and it has
 * not been done since. A reaction of the keeper (a rule id such as
 * "sump-full") can BRING A TASK FORWARD: it is due at once.
 *
 * Pure functions over plain data. Dates are local calendar days ("YYYY-MM-DD"
 * or Date); "last done" comes from whoever keeps the record (the twin edge).
 */
import { CARE_GUIDE } from "./careGuide.generated.js";

export type CareWho = "robot" | "person";

export interface CareTask {
  readonly id: string;
  readonly who: CareWho | string;
  readonly label: Readonly<Record<string, string>>;
  readonly why: Readonly<Record<string, string>>;
  readonly everyDays?: number;
  readonly months?: readonly number[];
  readonly job?: string;
  readonly bringForwardOn?: readonly string[];
  readonly auto?: boolean;
}

/** What the edge's autopilot does in a rehearsal in place of a person (docs/adr/0031): refill what runs low, do the
 * person's due tasks, then confirm the robot's proposals in `order`; the `daily` jobs only look, once a day. */
export interface AutopilotPolicy {
  readonly order: readonly string[];
  readonly daily: readonly string[];
  readonly refills: { readonly hopperGrams: number; readonly brownsGrams: number; readonly tankShare: number };
  readonly fills: { readonly hopper: Readonly<Record<string, number>>; readonly brownsGrams: number };
}

export interface CareGuide {
  readonly id: string;
  readonly tasks: readonly CareTask[];
  readonly autopilot?: Partial<AutopilotPolicy>;
}

const AUTOPILOT_DEFAULTS: AutopilotPolicy = {
  order: ["harvest", "clear", "period", "water", "valve", "feed", "care", "rest", "tap", "topdress", "plant", "stamp", "scan", "probe", "photo"],
  daily: ["scan", "probe", "photo"],
  refills: { hopperGrams: 300, brownsGrams: 200, tankShare: 0.2 },
  fills: { hopper: { vegetable: 600, fruit: 300, coffee: 100 }, brownsGrams: 1000 },
};

/** The guide's autopilot policy, each part falling back to the defaults. */
export function autopilotPolicy(guide: CareGuide = CARE_GUIDE as unknown as CareGuide): AutopilotPolicy {
  const a = guide.autopilot ?? {};
  return {
    order: a.order ?? AUTOPILOT_DEFAULTS.order,
    daily: a.daily ?? AUTOPILOT_DEFAULTS.daily,
    refills: { ...AUTOPILOT_DEFAULTS.refills, ...a.refills },
    fills: { ...AUTOPILOT_DEFAULTS.fills, ...a.fills },
  };
}

export type CareReason = "never" | "rhythm" | "season" | "brought";

export interface CareDue {
  task: CareTask;
  due: boolean;
  /** why it is due now; null when it is not */
  reason: CareReason | null;
  /** the day it falls due next by its rhythm (YYYY-MM-DD), null for a task without one */
  nextOn: string | null;
  /** days past due by its rhythm; 0 when not overdue */
  overdueDays: number;
}

const DAY_MS = 86_400_000;
const day = (d: Date | string) => {
  const x = typeof d === "string" ? new Date(`${d}T00:00:00`) : new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return x;
};
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const daysBetween = (a: Date, b: Date) => Math.round((day(b).getTime() - day(a).getTime()) / DAY_MS);

/** The first day of the run of the task's months that `today` lies in, or null outside its months. */
function seasonStart(months: readonly number[], today: Date): Date | null {
  const m = today.getMonth() + 1;
  if (!months.includes(m)) return null;
  let first = m, year = today.getFullYear();
  for (let i = 0; i < 11; i++) {
    const prev = first === 1 ? 12 : first - 1;
    if (!months.includes(prev)) break;
    if (prev === 12) year -= 1;
    first = prev;
  }
  return new Date(year, first - 1, 1);
}

/** Every task of the guide with whether it is due today. `active`: the keeper's reactions in force now. */
export function careDue(guide: CareGuide = CARE_GUIDE as unknown as CareGuide, lastDone: Record<string, string | undefined> = {},
  today: Date | string = new Date(), active: readonly string[] = []): CareDue[] {
  const now = day(today);
  return guide.tasks.map((task) => {
    const last = lastDone[task.id] ? day(lastDone[task.id]!) : null;
    let reason: CareReason | null = null;
    let nextOn: string | null = null;
    let overdueDays = 0;
    if (task.everyDays) {
      const next = last ? new Date(last.getFullYear(), last.getMonth(), last.getDate() + task.everyDays) : now;   // calendar days: no clock change
      nextOn = iso(next);
      if (!last) reason = "never";
      else if (daysBetween(next, now) >= 0) {
        reason = "rhythm";
        overdueDays = daysBetween(next, now);
      }
    }
    if (!reason && task.months?.length) {
      const start = seasonStart(task.months, now);
      if (start && (!last || last < start)) reason = "season";
    }
    if (!reason && task.bringForwardOn?.some((r) => active.includes(r)) && (!last || daysBetween(last, now) >= 1)) reason = "brought";
    if (!task.everyDays && !task.months?.length && reason === null && !last && !task.bringForwardOn?.length) reason = "never";
    return { task, due: reason !== null, reason, nextOn, overdueDays };
  });
}

/** The seasonal tasks of a month (1-12), for the year view. */
export function careInMonth(guide: CareGuide = CARE_GUIDE as unknown as CareGuide, month: number): CareTask[] {
  return guide.tasks.filter((t) => t.months?.includes(month));
}

/** The tasks that come round by a rhythm, shortest first: what a week or a month of care looks like. */
export function careRhythms(guide: CareGuide = CARE_GUIDE as unknown as CareGuide): CareTask[] {
  return guide.tasks.filter((t) => t.everyDays).slice().sort((a, b) => a.everyDays! - b.everyDays!);
}
