import * as React from "react";
import { cropById, cropName, minDepthCm, monthsOf, newId, newPeriod, periodFits, periodsOf, planFarm, plantSets, setName, setText } from "@dlab5/permtek5-core";
import type { Bed, BedPeriod, Habitat, PlantSet, SetChoice, SetPlan } from "@dlab5/permtek5-core";
import { useT } from "../../lib/i18n";
import { cropColor, monthName } from "./common";
import { Preview } from "./HabitatRecipes";

type Edit = (f: (h: Habitat) => Habitat) => void;

/**
 * Plan beds from plant sets (docs/adr/0027): pick sets such as "Kitchen herbs" and their shares; the planner
 * places the biggest plants first and the little ones last, low ground covers under tall plants. One bed, or a
 * farm's beds: the same sets in every bed, or the sets shared out, each getting beds by its share (docs/adr/0028).
 * Each library set links to its page, which explains why its crops go together. A suggestion: a person accepts
 * it, then fine-tunes by hand.
 *
 * A bed plans one of its periods (docs/adr/0029): `periodId`, or the bed as it stands. The sets chosen are kept on
 * the period. A farm plans a period by months, made in every bed that has those months free.
 */
export function PlanFromSets({ beds, habitat, edit, canEdit, periodId }: { beds: Bed[]; habitat: Habitat; edit: Edit; canEdit: boolean; periodId?: string }) {
  const { t, lang } = useT();
  const own = habitat.plantSets ?? [];
  const all: PlantSet[] = [...plantSets(), ...own];
  const library = new Set(plantSets().map((s) => s.id));
  const period = periodId ? (habitat.periods ?? []).find((p) => p.id === periodId) : undefined;
  const farm = beds.length > 1;
  const [months, setMonths] = React.useState({ from: 4, to: 9, name: t("period.default.growing") });
  // the period each bed plans: the bed's own, or for a farm the bed's period with these months (made on accept)
  const bedPeriod = (b: Bed): BedPeriod | undefined => farm
    ? periodsOf(habitat, b.id).find((p) => p.fromMonth === months.from && p.toMonth === months.to)
    : period;
  const [shares, setShares] = React.useState<Record<string, number>>(() => Object.fromEntries((period?.sets ?? []).map((c) => [c.setId, c.share])));
  const [seed, setSeed] = React.useState(5);
  const [same, setSame] = React.useState(true);
  // the shallowest bed decides which crops may be too deep-rooted for it
  const depth = Math.min(...beds.map((b) => b.depthCm ?? Infinity));
  const tooDeep = (s: PlantSet) => s.members.filter((m) => (minDepthCm(m.cropId) ?? 0) > depth).map((m) => m.cropId);
  const [plans, setPlans] = React.useState<{ bedId: string; choices: SetChoice[]; plan: SetPlan }[] | null>(null);
  const choices: SetChoice[] = Object.entries(shares).filter(([, n]) => n > 0).map(([setId, share]) => ({ setId, share }));
  const name = (id: string) => (cropById(id) ? cropName(cropById(id)!, lang) : id);
  const bedName = (id: string) => beds.find((b) => b.id === id)?.name ?? "";
  const setTitle = (id: string) => { const s = all.find((x) => x.id === id); return s ? setName(s, lang) : id; };

  // a farm's beds whose year has no room for these months are left out
  const fits = (b: Bed) => !!bedPeriod(b) || periodFits(habitat, newPeriod(b, months.name, "GrowingKind", months.from, months.to));
  const planned = farm ? beds.filter(fits) : beds;
  // what already stands in the period being planned
  const existing = habitat.cells.filter((c) => planned.some((b) => b.id === c.bedId) && (c.periodId ?? "") === (bedPeriod(planned.find((b) => b.id === c.bedId)!)?.id ?? ""));
  const suggest = (nextSeed = seed, nextSame = same) => setPlans(planFarm(planned, choices, existing, { seed: nextSeed, same: nextSame }, own));
  const accept = () => {
    if (!plans) return;
    edit((h) => {
      let periods = h.periods ?? [];
      const cells = plans.flatMap((p) => {
        const bed = beds.find((b) => b.id === p.bedId)!;
        let target = farm ? periods.find((x) => x.bedId === bed.id && x.fromMonth === months.from && x.toMonth === months.to) : period;
        if (farm && !target) { target = newPeriod(bed, months.name, "GrowingKind", months.from, months.to); periods = [...periods, target]; }
        // the period keeps the sets it was planned from
        if (target) { const id = target.id; periods = periods.map((x) => (x.id === id ? { ...x, sets: p.choices } : x)); }
        return p.plan.cells.map((c) => ({
          id: newId("cell"), bedId: p.bedId, row: c.row, col: c.col, cropId: c.cropId, status: "CellPlanned" as const,
          ...(target && { periodId: target.id }),
        }));
      });
      return { ...h, cells: [...h.cells, ...cells], ...(periods.length > 0 && { periods }) };
    });
    setPlans(null);
  };
  const placed = plans?.reduce((n, p) => n + p.plan.cells.length, 0) ?? 0;

  return (
    <details className="pt-plansets">
      <summary>{t(beds.length > 1 ? "pset.plan.farm" : "pset.plan")}</summary>
      <p className="pt-muted">{t("pset.hint")}</p>
      {farm && (
        <div className="pt-habitat__fields">
          <label className="pt-field"><span>{t("period.name")}</span>
            <input value={months.name} onChange={(e) => setMonths({ ...months, name: e.target.value })} />
          </label>
          <MonthPick label={t("period.from")} value={months.from} on={(m) => { setMonths({ ...months, from: m }); setPlans(null); }} />
          <MonthPick label={t("period.to")} value={months.to} on={(m) => { setMonths({ ...months, to: m }); setPlans(null); }} />
        </div>
      )}
      {farm && planned.length < beds.length && (
        <p className="pt-plansets__deep">{t("period.farm.full", { n: beds.length - planned.length, months: monthsOf({ fromMonth: months.from, toMonth: months.to }).length })}</p>
      )}
      {beds.length > 1 && (
        <div className="pt-habitat__chips" role="radiogroup" aria-label={t("pset.farm")}>
          {[true, false].map((o) => (
            <button key={String(o)} type="button" role="radio" aria-checked={same === o} className={"pt-chip" + (same === o ? " pt-chip--on" : "")}
              onClick={() => { setSame(o); if (plans) suggest(seed, o); }}>{t(o ? "pset.farm.same" : "pset.farm.shared")}</button>
          ))}
        </div>
      )}
      <ul className="pt-plansets__list">
        {all.map((s) => (
          <li key={s.id}>
            <label className="pt-guild__check">
              <input type="checkbox" checked={(shares[s.id] ?? 0) > 0}
                onChange={(e) => { setShares({ ...shares, [s.id]: e.target.checked ? 1 : 0 }); setPlans(null); }} />
              <strong>{setName(s, lang)}</strong>
              {s.draft && <span className="pt-badge">{t("pset.draft")}</span>}
            </label>
            {/* the library's sets have a page that explains them; a space's own set shows its reasons here */}
            {library.has(s.id)
              ? <a className="pt-plansets__why" href={`/sets/#${s.id}`} target="_blank" rel="noopener">{t("pset.why")}</a>
              : s.why && <details className="pt-plansets__why"><summary>{t("pset.why")}</summary><p>{setText(s.why, lang)}</p></details>}
            {(shares[s.id] ?? 0) > 0 && (
              <label className="pt-plansets__share">{t("pset.share")}
                <input type="range" min={1} max={5} value={shares[s.id]} aria-label={t("pset.share")}
                  onChange={(e) => { setShares({ ...shares, [s.id]: Number(e.target.value) }); setPlans(null); }} />
                <span>{shares[s.id]}</span>
              </label>
            )}
            {s.about && <span className="pt-plansets__about">{setText(s.about, lang)}</span>}
            <span className="pt-muted pt-plansets__members">
              {s.members.map((m) => name(m.cropId)).join(", ")}
            </span>
            {tooDeep(s).length > 0 && Number.isFinite(depth) && (
              <span className="pt-plansets__deep">{t("pset.deep", { crops: tooDeep(s).map(name).join(", "), cm: depth })}</span>
            )}
          </li>
        ))}
      </ul>
      <p className="pt-habitat__actions">
        <button className="pt-button" disabled={!choices.length || !planned.length} onClick={() => suggest()}>{t("rec.plant.suggest")}</button>
        {plans && <button className="pt-button pt-button--ghost" onClick={() => { setSeed(seed + 1); suggest(seed + 1); }}>{t("rec.plant.again")}</button>}
      </p>
      {plans && plans.map(({ bedId, choices: mine, plan }) => {
        const bed = beds.find((b) => b.id === bedId)!;
        return (
          <div key={bedId} className="pt-plansets__bed">
            {beds.length > 1 && <h4>{bedName(bedId)}: {mine.map((c) => setTitle(c.setId)).join(" + ") || t("pset.none")}</h4>}
            <Preview bed={bed} suggestion={plan} habitat={habitat} existing={existing.filter((c) => c.bedId === bedId)} />
            <p className="pt-recipes__legend">
              {plan.crops.filter((c) => c.placed > 0).map((c) => (
                <span key={c.cropId}><span className="pt-recipe__dot" style={{ background: cropColor(c.cropId) }} />{c.placed} × {name(c.cropId)}</span>
              ))}
            </p>
            <p className="pt-muted">
              {t("rec.plant.result", { good: plan.goodPairs, bad: plan.badPairs, same: plan.sameCropPairs, cover: Math.round(plan.cover * 100) })}
            </p>
            {plan.sets.flatMap((s) => s.crops.filter((c) => c.why && c.placed === 0)).map((c) => (
              <p key={c.cropId} className="pt-muted">{name(c.cropId)}: {c.why === "noRoom" ? t("pset.noRoom") : t(`rec.plant.why.${c.why}`, { placed: 0, wanted: 1 })}</p>
            ))}
          </div>
        );
      })}
      {plans && (
        <>
          <p className="pt-muted">{t("rec.plant.caveat")} <a href="/sets/#how" target="_blank" rel="noopener">{t("pset.layout.why")}</a></p>
          {canEdit && <button className="pt-button" onClick={accept} disabled={!placed}>{t("rec.plant.accept", { n: placed })}</button>}
        </>
      )}
    </details>
  );
}

/** A month of the year, by its name in the page's language. */
export function MonthPick({ label, value, on, disabled }: { label: string; value: number; on: (m: number) => void; disabled?: boolean }) {
  const { lang } = useT();
  return (
    <label className="pt-field"><span>{label}</span>
      <select value={value} disabled={disabled} onChange={(e) => on(Number(e.target.value))}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => <option key={m} value={m}>{monthName(m, lang)}</option>)}
      </select>
    </label>
  );
}
