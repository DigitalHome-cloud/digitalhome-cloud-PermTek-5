import * as React from "react";
import { CARE_GUIDE, careInMonth, careRhythms } from "@dlab5/permtek5-core";
import type { CareTask, Habitat } from "@dlab5/permtek5-core";
import { useT } from "../../lib/i18n";

type Lang = "en" | "de" | "fr";
const RHYTHM: Record<number, string> = { 1: "care.daily", 7: "care.weekly", 30: "care.monthly", 90: "care.quarterly", 365: "care.yearly" };

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
