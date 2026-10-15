import * as React from "react";
import { cropById, cropName, newId, planFarm, plantSets, setName } from "@dlab5/permtek5-core";
import type { Bed, Habitat, PlantSet, SetChoice, SetPlan } from "@dlab5/permtek5-core";
import { useT } from "../../lib/i18n";
import { cropColor } from "./common";
import { Preview } from "./HabitatRecipes";

type Edit = (f: (h: Habitat) => Habitat) => void;

/**
 * Plan beds from plant sets (docs/adr/0027): pick sets such as "Kitchen herbs" and their shares; the planner
 * places the biggest plants first and the little ones last, low ground covers under tall plants. One bed, or a
 * farm's beds, each set getting beds by its share. A suggestion: a person accepts it, then fine-tunes by hand.
 */
export function PlanFromSets({ beds, habitat, edit, canEdit }: { beds: Bed[]; habitat: Habitat; edit: Edit; canEdit: boolean }) {
  const { t, lang } = useT();
  const own = habitat.plantSets ?? [];
  const all: PlantSet[] = [...plantSets(), ...own];
  const [shares, setShares] = React.useState<Record<string, number>>({});
  const [seed, setSeed] = React.useState(5);
  const [plans, setPlans] = React.useState<{ bedId: string; choices: SetChoice[]; plan: SetPlan }[] | null>(null);
  const choices: SetChoice[] = Object.entries(shares).filter(([, n]) => n > 0).map(([setId, share]) => ({ setId, share }));
  const name = (id: string) => (cropById(id) ? cropName(cropById(id)!, lang) : id);
  const bedName = (id: string) => beds.find((b) => b.id === id)?.name ?? "";
  const setTitle = (id: string) => { const s = all.find((x) => x.id === id); return s ? setName(s, lang) : id; };

  const suggest = (nextSeed = seed) => setPlans(planFarm(beds, choices, habitat.cells, { seed: nextSeed }, own));
  const accept = () => {
    if (!plans) return;
    edit((h) => ({
      ...h,
      cells: [...h.cells, ...plans.flatMap((p) => p.plan.cells.map((c) => ({
        id: newId("cell"), bedId: p.bedId, row: c.row, col: c.col, cropId: c.cropId, status: "CellPlanned" as const,
      })))],
    }));
    setPlans(null);
  };
  const placed = plans?.reduce((n, p) => n + p.plan.cells.length, 0) ?? 0;

  return (
    <details className="pt-plansets">
      <summary>{t(beds.length > 1 ? "pset.plan.farm" : "pset.plan")}</summary>
      <p className="pt-muted">{t("pset.hint")}</p>
      <ul className="pt-plansets__list">
        {all.map((s) => (
          <li key={s.id}>
            <label className="pt-guild__check">
              <input type="checkbox" checked={(shares[s.id] ?? 0) > 0}
                onChange={(e) => { setShares({ ...shares, [s.id]: e.target.checked ? 1 : 0 }); setPlans(null); }} />
              <strong>{setName(s, lang)}</strong>
              {s.draft && <span className="pt-badge">{t("pset.draft")}</span>}
            </label>
            {(shares[s.id] ?? 0) > 0 && (
              <label className="pt-plansets__share">{t("pset.share")}
                <input type="range" min={1} max={5} value={shares[s.id]} aria-label={t("pset.share")}
                  onChange={(e) => { setShares({ ...shares, [s.id]: Number(e.target.value) }); setPlans(null); }} />
                <span>{shares[s.id]}</span>
              </label>
            )}
            <span className="pt-muted pt-plansets__members">
              {s.members.map((m) => name(m.cropId)).join(", ")}
            </span>
          </li>
        ))}
      </ul>
      <p className="pt-habitat__actions">
        <button className="pt-button" disabled={!choices.length} onClick={() => suggest()}>{t("rec.plant.suggest")}</button>
        {plans && <button className="pt-button pt-button--ghost" onClick={() => { setSeed(seed + 1); suggest(seed + 1); }}>{t("rec.plant.again")}</button>}
      </p>
      {plans && plans.map(({ bedId, choices: mine, plan }) => {
        const bed = beds.find((b) => b.id === bedId)!;
        return (
          <div key={bedId} className="pt-plansets__bed">
            {beds.length > 1 && <h4>{bedName(bedId)}: {mine.map((c) => setTitle(c.setId)).join(" + ") || t("pset.none")}</h4>}
            <Preview bed={bed} suggestion={plan} habitat={habitat} />
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
          <p className="pt-muted">{t("rec.plant.caveat")}</p>
          {canEdit && <button className="pt-button" onClick={accept} disabled={!placed}>{t("rec.plant.accept", { n: placed })}</button>}
        </>
      )}
    </details>
  );
}
