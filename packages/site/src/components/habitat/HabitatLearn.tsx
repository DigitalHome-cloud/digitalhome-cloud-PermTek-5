import * as React from "react";
import { PHASES, SIZING_GUIDE, adoptStarter, checksDue, newId, nextCycle, nextPhase, say, verdict, waterBudget } from "@dlab5/permtek5-core";
import type { Check, ClimateMonth, Guild, Habitat, Hypothesis, LearningCycle, StarterGuide } from "@dlab5/permtek5-core";
import { useT } from "../../lib/i18n";
import { num } from "./common";

type Edit = (f: (h: Habitat) => Habitat) => void;
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * What the habitat is learning (docs/adr/0026): per guild, its plan-do-check-act cycles. Plan: the hypotheses,
 * each a number expected and the range in which it holds. Do: the measures, and which are due. Check: the
 * measured values against the range, and the verdicts. Act: what was changed, and the next cycle. The cycles
 * live in the habitat's graph, so the guild's edge sees them too.
 */
export function HabitatLearn({ habitat, edit, canEdit, months }: { habitat: Habitat; edit: Edit; canEdit: boolean; months: ClimateMonth[] | null }) {
  const { t } = useT();
  const guilds = habitat.guilds ?? [];
  return (
    <div className="pt-learn">
      <p className="pt-muted">{t("learn.intro")}</p>
      {!guilds.length && <p className="pt-empty">{t("learn.noGuild")}</p>}
      {guilds.map((g) => <GuildLearning key={g.id} guild={g} habitat={habitat} edit={edit} canEdit={canEdit} months={months} />)}
    </div>
  );
}

function GuildLearning({ guild, habitat, edit, canEdit, months }: { guild: Guild; habitat: Habitat; edit: Edit; canEdit: boolean; months: ClimateMonth[] | null }) {
  const { t, lang } = useT();
  const cycles = (habitat.cycles ?? []).filter((c) => c.aboutId === guild.id);
  const running = cycles.some((c) => c.starter === SIZING_GUIDE.id && c.phase !== "ActPhase");
  const adopt = () => edit((h) => ({ ...h, cycles: [...(h.cycles ?? []), adoptStarter(SIZING_GUIDE as unknown as StarterGuide, guild.id, today())] }));
  return (
    <section className="pt-panel pt-learn__guild">
      <h2 className="pt-panel__sub">{guild.name} <span className="pt-badge">Perma5Guild · {guild.type}</span></h2>
      {!cycles.length && <p className="pt-muted">{t("learn.none")}</p>}
      {canEdit && guild.type === "WormBed5" && !running && (
        <p>
          <button className="pt-button" onClick={adopt}>{t("learn.adopt")}</button>{" "}
          <span className="pt-muted">{say(SIZING_GUIDE.about, lang)}</span>
        </p>
      )}
      {[...cycles].reverse().map((c) => <CycleCard key={c.id} cycle={c} habitat={habitat} edit={edit} canEdit={canEdit} months={months} />)}
    </section>
  );
}

function CycleCard({ cycle, habitat, edit, canEdit, months }: { cycle: LearningCycle; habitat: Habitat; edit: Edit; canEdit: boolean; months: ClimateMonth[] | null }) {
  const { t, lang } = useT();
  const set = (f: (c: LearningCycle) => LearningCycle) => edit((h) => ({ ...h, cycles: (h.cycles ?? []).map((c) => (c.id === cycle.id ? f(c) : c)) }));
  const ended = !!cycle.endsOn && cycle.endsOn <= today();
  // the verdicts follow the checks; what is stored is the last one worked out
  const withVerdicts = (c: LearningCycle): LearningCycle => ({ ...c, hypotheses: c.hypotheses.map((h) => ({ ...h, verdict: verdict(h, c.checks, ended) })) });
  const due = checksDue(cycle, today());
  const budget = months ? waterBudget(habitat, cycle.aboutId, months) : null;
  const measureOf = (h: Hypothesis) => cycle.measures.find((m) => m.id === h.measureId);
  const isPlan = cycle.phase === "PlanPhase", isAct = cycle.phase === "ActPhase";
  const measuring = cycle.phase === "DoPhase" || cycle.phase === "CheckPhase";
  const advance = () => set((c) => withVerdicts({ ...c, phase: nextPhase(c.phase) }));
  const again = () => edit((h) => ({ ...h, cycles: [...(h.cycles ?? []), nextCycle(cycle, today(), { en: "next", de: "nächster", fr: "suivant" })] }));
  const remove = () => edit((h) => ({ ...h, cycles: (h.cycles ?? []).filter((c) => c.id !== cycle.id) }));
  const setHyp = (id: string, patch: Partial<Hypothesis>) => set((c) => ({ ...c, hypotheses: c.hypotheses.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  return (
    <article className="pt-learn__cycle">
      <header className="pt-learn__head">
        <strong>{say(cycle.name, lang)}</strong>
        <span className="pt-muted">{cycle.startedOn} – {cycle.endsOn}</span>
        <ol className="pt-learn__phases" aria-label={t("learn.phases")}>
          {PHASES.map((p) => (
            <li key={p} className={`pt-chip${p === cycle.phase ? " pt-chip--on" : ""}`} aria-current={p === cycle.phase ? "step" : undefined}>{t(`learn.phase.${p}`)}</li>
          ))}
        </ol>
        {canEdit && !isAct && <button className="pt-button" onClick={advance}>{t(`learn.next.${cycle.phase}`)}</button>}
        {canEdit && isAct && <button className="pt-button" onClick={again}>{t("learn.again")}</button>}
      </header>
      <p className="pt-muted">{t(`learn.about.${cycle.phase}`)}</p>
      {measuring && (
        <p className={due.length ? "pt-learn__due" : "pt-muted"}>
          {due.length ? t("learn.due", { list: due.map((d) => `${d.measure.code ?? ""} ${say(d.measure.label, lang)}`.trim()).join(" · ") }) : t("learn.nothingDue")}
        </p>
      )}
      <ul className="pt-learn__hyps">
        {cycle.hypotheses.map((h) => (
          <HypothesisRow key={h.id} h={h} cycle={cycle} measure={measureOf(h)} canEdit={canEdit} isPlan={isPlan} isAct={isAct} measuring={measuring}
            model={h.code === "H7" && budget?.seasonSharePct != null ? budget.seasonSharePct : null}
            onChange={(patch) => setHyp(h.id, patch)}
            onCheck={(k) => set((c) => withVerdicts({ ...c, checks: [...c.checks, k] }))}
            onUncheck={(id) => set((c) => withVerdicts({ ...c, checks: c.checks.filter((k) => k.id !== id) }))} />
        ))}
      </ul>
      {canEdit && isPlan && <p><button className="pt-button pt-button--ghost" onClick={remove}>{t("learn.remove")}</button></p>}
    </article>
  );
}

function HypothesisRow({ h, cycle, measure, canEdit, isPlan, isAct, measuring, model, onChange, onCheck, onUncheck }: {
  h: Hypothesis; cycle: LearningCycle; measure?: LearningCycle["measures"][number]; canEdit: boolean; isPlan: boolean; isAct: boolean; measuring: boolean;
  model: number | null; onChange: (p: Partial<Hypothesis>) => void; onCheck: (k: Check) => void; onUncheck: (id: string) => void;
}) {
  const { t, lang } = useT();
  const [value, setValue] = React.useState("");
  const [on, setOn] = React.useState(today());
  const checks = cycle.checks.filter((k) => k.hypothesisId === h.id);
  const v = h.verdict ?? "VerdictOpen";
  // the strip: the range from low to high in the middle half, room either side for values outside it
  const span = Math.max(h.high - h.low, Math.abs(h.expected) * 0.2, 1e-9);
  const lo = h.low - span / 2, hi = h.high + span / 2;
  const x = (n: number) => `${Math.max(0, Math.min(100, ((n - lo) / (hi - lo)) * 100))}%`;
  const numberIn = (key: "expected" | "low" | "high") => (
    <input className="pt-input pt-learn__num" type="number" step="any" value={h[key]} aria-label={t(`learn.${key}`)}
      onChange={(e) => { const n = num(e.target.value); if (n !== undefined) onChange({ [key]: n }); }} />
  );
  const add = () => {
    const n = num(value);
    if (n === undefined) return;
    onCheck({ id: newId("check"), hypothesisId: h.id, value: n, on, by: "person" });
    setValue("");
  };
  return (
    <li className={`pt-learn__hyp pt-learn__hyp--${v}`}>
      <div className="pt-learn__hyphead">
        <span className="pt-learn__code">{h.code}</span>
        <strong>{say(h.label, lang)}</strong>
        <span className={`pt-badge pt-learn__verdict pt-learn__verdict--${v}`}>{t(`learn.verdict.${v}`)}</span>
      </div>
      <p className="pt-learn__numbers">
        {canEdit && (isPlan || isAct)
          ? <>{t("learn.expected")} {numberIn("expected")} {t("learn.range")} {numberIn("low")} – {numberIn("high")} {h.unit}</>
          : <>{t("learn.expectedIs", { n: h.expected, low: h.low, high: h.high, unit: h.unit })}</>}
        {model !== null && <span className="pt-muted"> · {t("learn.model", { n: model, unit: h.unit })}</span>}
      </p>
      <div className="pt-learn__strip" role="img" aria-label={t("learn.strip", { n: checks.length })}>
        <span className="pt-learn__range" style={{ left: x(h.low), width: `calc(${x(h.high)} - ${x(h.low)})` }} />
        <span className="pt-learn__expected" style={{ left: x(h.expected) }} />
        {checks.map((k) => (
          <span key={k.id} className={`pt-learn__dot${k.value < h.low || k.value > h.high ? " pt-learn__dot--out" : ""}`} style={{ left: x(k.value) }}
            title={`${k.on}: ${k.value} ${h.unit}`} />
        ))}
      </div>
      {h.why && <details className="pt-learn__why"><summary>{t("learn.why")}</summary><p>{say(h.why, lang)}</p>
        {measure && <p className="pt-muted">{t("learn.measure", { code: measure.code ?? "", name: say(measure.label, lang), every: measure.everyDays ?? 30 })} {say(measure.method, lang)}</p>}
        {h.source && <p className="pt-muted">{t("learn.source", { source: h.source })}</p>}
      </details>}
      {checks.length > 0 && (
        <ul className="pt-learn__checks">
          {checks.map((k) => (
            <li key={k.id}>{k.on}: <strong>{k.value}</strong> {h.unit} <span className="pt-muted">· {t(`learn.by.${k.by ?? "person"}`)}</span>
              {canEdit && measuring && <button className="pt-linkbutton" onClick={() => onUncheck(k.id)} aria-label={t("learn.uncheck")}>×</button>}</li>
          ))}
        </ul>
      )}
      {canEdit && measuring && (
        <p className="pt-learn__add">
          <input className="pt-input pt-learn__num" type="number" step="any" value={value} placeholder={h.unit} aria-label={t("learn.value")}
            onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
          <input className="pt-input" type="date" value={on} aria-label={t("learn.on")} onChange={(e) => setOn(e.target.value)} />
          <button className="pt-button pt-button--ghost" onClick={add} disabled={num(value) === undefined}>{t("learn.addCheck")}</button>
        </p>
      )}
      {isAct && (canEdit
        ? <textarea className="pt-input pt-learn__act" rows={2} value={h.actTaken ?? ""} placeholder={t("learn.actPlaceholder")} aria-label={t("learn.act")}
            onChange={(e) => onChange({ actTaken: e.target.value || undefined })} />
        : h.actTaken && <p><em>{t("learn.act")}:</em> {h.actTaken}</p>)}
    </li>
  );
}
