import * as React from "react";
import { CARE_GUIDE, careInMonth, careRhythms } from "@dlab5/permtek5-core";
import type { CareTask, Habitat } from "@dlab5/permtek5-core";
import { useT } from "../../lib/i18n";
import { guildCare, markCareDone } from "../../lib/data";
import type { GuildCare } from "../../lib/data";

type Lang = "en" | "de" | "fr";
const RHYTHM: Record<number, string> = { 1: "care.daily", 7: "care.weekly", 30: "care.monthly", 90: "care.quarterly", 365: "care.yearly" };

const STALE_MS = 2 * 3_600_000;   // the edge reports at least hourly: two hours without a word is worth saying
const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** The care calendar (packages/ontology/guides/wormbed5-care.json) is for WormBed5 guilds. */
export const hasCare = (habitat: Habitat) => (habitat.guilds ?? []).some((g) => g.type === CARE_GUIDE.guildType);

function useCare() {
  const { t, lang } = useT();
  const l = (["en", "de", "fr"].includes(lang) ? lang : "en") as Lang;
  const who = (task: CareTask) => (CARE_GUIDE.who as Record<string, Record<Lang, string>>)[task.who]?.[l] ?? task.who;
  const every = (n: number) => (RHYTHM[n] ? t(RHYTHM[n]) : t("care.every", { n }));
  return { t, l, who, every };
}

function Task({ task, rhythm }: { task: CareTask; rhythm?: boolean }) {
  const { l, who, every } = useCare();
  return (
    <li className={`pt-care__task pt-care__task--${task.who}`}>
      <span className="pt-care__who">{who(task)}</span> <strong>{task.label[l]}</strong>
      {rhythm && task.everyDays ? <span className="pt-muted"> · {every(task.everyDays)}</span> : null}
      <div className="pt-muted">{task.why[l]}</div>
    </li>
  );
}

/** What a month asks for: its seasonal work, and the rhythms that always run. */
export function CareNow({ month }: { month: number }) {
  const { t } = useCare();
  const seasonal = careInMonth(undefined, month);
  return (
    <section className="pt-care">
      <h2 className="pt-panel__sub">{t("care.month")}</h2>
      {seasonal.length === 0 ? <p className="pt-muted">{t("care.none")}</p>
        : <ul className="pt-now">{seasonal.map((task) => <Task key={task.id} task={task} />)}</ul>}
      <details>
        <summary>{t("care.rhythms")}</summary>
        <ul className="pt-now">{careRhythms().map((task) => <Task key={task.id} task={task} rhythm />)}</ul>
      </details>
      <p className="pt-panel__hint">{t("care.note")}</p>
    </section>
  );
}

/** The seasonal work month by month, under the planting calendar. */
export function CareYear({ names, now }: { names: string[]; now: number }) {
  const { t, l, who } = useCare();
  const seasonal = CARE_GUIDE.tasks.filter((task) => (task as CareTask).months?.length) as readonly CareTask[];
  return (
    <section className="pt-care">
      <h2 className="pt-panel__sub">{t("care.title")}</h2>
      <p className="pt-muted">{CARE_GUIDE.about[l]}</p>
      <div className="pt-climate__scroll">
        <table className="pt-table pt-cal">
          <thead>
            <tr><th scope="col">{t("care.task")}</th>
              {names.map((n, i) => <th scope="col" key={n} className={i + 1 === now ? "pt-cal__now" : undefined}>{n}</th>)}</tr>
          </thead>
          <tbody>
            {seasonal.map((task) => (
              <tr key={task.id}>
                <th scope="row" title={task.why[l]}>{task.label[l]} <span className="pt-muted">· {who(task)}</span></th>
                {names.map((n, i) => (
                  <td key={n} className={i + 1 === now ? "pt-cal__now" : undefined}>
                    {task.months!.includes(i + 1) && <span className={`pt-cal__act pt-care__mark pt-care__mark--${task.who}`} />}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details>
        <summary>{t("care.rhythms")}</summary>
        <ul className="pt-now">{careRhythms().map((task) => <Task key={task.id} task={task} rhythm />)}</ul>
      </details>
    </section>
  );
}

/** Today's care, as each guild's edge last reported it (docs/adr/0031): your chores with Done, the robot's jobs
 * (confirmed on the edge, never here), the keeper's reactions, and when the guild last reported. */
export function CareToday({ habitat, spaceId, canEdit }: { habitat: Habitat; spaceId: string; canEdit: boolean }) {
  const { t, l, who } = useCare();
  const [guilds, setGuilds] = React.useState<GuildCare[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const load = React.useCallback(() => {
    setError(null);
    guildCare(spaceId).then(setGuilds, (e: Error) => setError(e.message));
  }, [spaceId]);
  React.useEffect(load, [load]);
  const done = (g: GuildCare, taskId: string) => {
    setBusy(`${g.edgeId}/${taskId}`);
    markCareDone(g.edgeId, taskId)
      .then((n) => setGuilds((all) => (all ?? []).map((x) => (x.edgeId === n.edgeId ? n : x))), (e: Error) => setError(e.message))
      .finally(() => setBusy(null));
  };
  const task = (id: string) => CARE_GUIDE.tasks.find((x) => x.id === id) as CareTask | undefined;
  const reported = (iso: string) => {
    const ms = Date.now() - new Date(iso).getTime();
    const mins = Math.max(0, Math.round(ms / 60_000));
    return { text: mins < 90 ? t("care.today.minutes", { n: mins }) : t("care.today.hours", { n: Math.round(mins / 60) }), stale: ms > STALE_MS };
  };
  const shown = (guilds ?? []).filter((g) => g.care);
  return (
    <section className="pt-care pt-care-today">
      <h2 className="pt-panel__sub">{t("care.today.title")}</h2>
      {error && <p className="pt-now__warn">{error}</p>}
      {guilds && !shown.length && <p className="pt-muted">{t("care.today.none")}</p>}
      {shown.map((g) => {
        const c = g.care!;
        const name = habitat.guilds?.find((x) => x.id === c.guildId)?.name ?? g.hostname ?? c.guildId;
        const when = reported(c.reportedAt);
        const chores = c.due.filter((d) => d.who === "person");
        const jobs = c.due.filter((d) => d.who !== "person");
        return (
          <div key={g.edgeId} className="pt-care-today__guild">
            <h3 className="pt-care-today__name">{name}</h3>
            <p className={when.stale ? "pt-now__warn" : "pt-muted"}>
              {t("care.today.reported", { when: when.text })}
              {c.today !== localDay(new Date()) && <> · {t("care.today.simulated", { day: c.today })}</>}
              {when.stale && <> · {t("care.today.stale")}</>}
            </p>
            {c.active.length > 0 && (
              <p className="pt-now__could">
                <span className="pt-muted">{t("care.today.keeper")} </span>
                {c.active.map((r) => <span key={r} className="pt-chip">{r}</span>)}
              </p>
            )}
            {!c.due.length && <p className="pt-muted">{t("care.today.nothing")}</p>}
            {chores.length > 0 && (
              <ul className="pt-now">
                {chores.map((d) => {
                  const k = task(d.id);
                  const waiting = g.pending.includes(d.id);
                  return (
                    <li key={d.id} className="pt-care__task pt-care__task--person">
                      <span className="pt-care__who">{k ? who(k) : d.who}</span> <strong>{k?.label[l] ?? d.id}</strong>
                      {d.overdueDays > 0 && <span className="pt-now__warn"> · {t("care.today.late", { n: d.overdueDays })}</span>}
                      {waiting ? <span className="pt-muted"> · {t("care.today.waiting")}</span>
                        : canEdit && (
                          <button className="pt-button pt-button--ghost pt-care-today__done" disabled={busy !== null}
                            onClick={() => done(g, d.id)}>{t("care.today.done")}</button>
                        )}
                      {k && <div className="pt-muted">{k.why[l]}</div>}
                    </li>
                  );
                })}
              </ul>
            )}
            {jobs.length > 0 && (
              <ul className="pt-now">
                {jobs.map((d) => {
                  const k = task(d.id);
                  return (
                    <li key={d.id} className="pt-care__task pt-care__task--robot">
                      <span className="pt-care__who">{k ? who(k) : d.who}</span> <strong>{k?.label[l] ?? d.id}</strong>
                      <span className="pt-muted"> · {t("care.today.onEdge")}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}
      <p className="pt-panel__hint">
        {t("care.today.note")} <a href="/autopilot/" target="_blank" rel="noopener">{t("care.today.how")}</a>
      </p>
      <button className="pt-button pt-button--ghost" onClick={load}>{t("care.today.refresh")}</button>
    </section>
  );
}
