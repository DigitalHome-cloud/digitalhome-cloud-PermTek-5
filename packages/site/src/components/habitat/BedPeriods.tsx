import * as React from "react";
import {
  checkPeriod, cropById, cropName, defaultPeriods, freeMonths, monthsOf, newPeriod, periodCells, periodCrops, periodFits, periodsOf, plantSets,
  setName, zoneOffset,
} from "@dlab5/permtek5-core";
import type { Bed, BedPeriod, ClimateMonth, Habitat, PeriodKind } from "@dlab5/permtek5-core";
import { useT } from "../../lib/i18n";
import { ConfirmButton, monthName } from "./common";
import { MonthPick } from "./PlantSets";

type Edit = (f: (h: Habitat) => Habitat) => void;

/**
 * A bed's year in periods (docs/adr/0029): growing periods, each with its own target planted from its plant sets,
 * and rest periods (winter or maintenance, a cover crop at most). The strip shows the twelve months; choosing a
 * period shows its target in the grid below. "As the bed stands" is what has no period yet.
 */
export function BedPeriods({ bed, habitat, edit, canEdit, months, period, setPeriod }: {
  bed: Bed; habitat: Habitat; edit: Edit; canEdit: boolean; months: ClimateMonth[] | null;
  period: string; setPeriod: (id: string) => void;
}) {
  const { t, lang } = useT();
  const periods = periodsOf(habitat, bed.id);
  const loose = periodCells(habitat, bed.id).length;
  const sel = periods.find((p) => p.id === period);
  const byMonth = new Map(periods.flatMap((p) => monthsOf(p).map((m) => [m, p] as const)));
  const set = (patch: Partial<BedPeriod>) => sel && edit((h) => ({ ...h, periods: (h.periods ?? []).map((p) => (p.id === sel.id ? { ...p, ...patch } : p)) }));
  const fitsWith = (patch: Partial<BedPeriod>) => !!sel && periodFits(habitat, { ...sel, ...patch });
  const warnings = sel ? checkPeriod(sel, [...periodCrops(sel, habitat.plantSets), ...periodCells(habitat, bed.id, sel.id).map((c) => c.cropId)], months, zoneOffset(habitat, bed.zoneId)) : [];
  const crop = (id: string) => (cropById(id) ? cropName(cropById(id)!, lang) : id);

  const add = (kind: PeriodKind) => {
    // the first run of free months
    const free = freeMonths(habitat, bed.id);
    if (!free.length) return;
    let to = free[0];
    while (free.includes((to % 12) + 1) && (to % 12) + 1 !== free[0]) to = (to % 12) + 1;
    const made = newPeriod(bed, t(kind === "RestKind" ? "period.default.rest" : "period.default.growing"), kind, free[0], to);
    edit((h) => ({ ...h, periods: [...(h.periods ?? []), made] }));
    setPeriod(made.id);
  };
  const setUp = () => {
    const [growing, rest] = defaultPeriods(bed, { growing: t("period.default.growing"), rest: t("period.default.rest") });
    // what the bed holds now becomes the growing period's target
    edit((h) => ({
      ...h, periods: [...(h.periods ?? []), growing, rest],
      cells: h.cells.map((c) => (c.bedId === bed.id && !c.periodId ? { ...c, periodId: growing.id } : c)),
    }));
    setPeriod(growing.id);
  };

  return (
    <div className="pt-periods">
      <h4 className="pt-periods__title">{t("period.title")}</h4>
      <div className="pt-periods__strip" role="list" aria-label={t("period.title")}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => {
          const p = byMonth.get(m);
          return (
            <button key={m} type="button" role="listitem" disabled={!p}
              className={"pt-periods__month" + (p ? ` pt-periods__month--${p.kind}` : "") + (p && p.id === period ? " pt-periods__month--on" : "")}
              title={p ? `${p.name} · ${t(`period.kind.${p.kind}`)}` : t("period.free")} onClick={() => p && setPeriod(p.id)}>
              {monthName(m, lang).slice(0, 3)}
            </button>
          );
        })}
      </div>
      <div className="pt-habitat__chips" role="radiogroup" aria-label={t("period.title")}>
        {(loose > 0 || !periods.length) && (
          <button type="button" role="radio" aria-checked={period === ""} className={"pt-chip" + (period === "" ? " pt-chip--on" : "")}
            onClick={() => setPeriod("")}>{t("period.current")}</button>
        )}
        {periods.map((p) => (
          <button key={p.id} type="button" role="radio" aria-checked={p.id === period} className={"pt-chip" + (p.id === period ? " pt-chip--on" : "")}
            onClick={() => setPeriod(p.id)}>
            {p.name} <span className="pt-muted">{monthName(p.fromMonth, lang)}–{monthName(p.toMonth, lang)}</span>
          </button>
        ))}
      </div>
      {!periods.length && <p className="pt-muted">{t("period.hint")}</p>}
      {canEdit && (
        <p className="pt-habitat__actions">
          {!periods.length && <button className="pt-button" onClick={setUp}>{t("period.setup")}</button>}
          <button className="pt-button pt-button--ghost" disabled={!freeMonths(habitat, bed.id).length} onClick={() => add("GrowingKind")}>{t("period.add.growing")}</button>
          <button className="pt-button pt-button--ghost" disabled={!freeMonths(habitat, bed.id).length} onClick={() => add("RestKind")}>{t("period.add.rest")}</button>
        </p>
      )}

      {sel && (
        <div className="pt-periods__edit">
          <div className="pt-habitat__fields">
            <label className="pt-field"><span>{t("period.name")}</span>
              <input value={sel.name} disabled={!canEdit} onChange={(e) => set({ name: e.target.value })} />
            </label>
            <label className="pt-field"><span>{t("period.kind")}</span>
              <select value={sel.kind} disabled={!canEdit} onChange={(e) => set({ kind: e.target.value as PeriodKind })}>
                {(["GrowingKind", "RestKind"] as PeriodKind[]).map((k) => <option key={k} value={k}>{t(`period.kind.${k}`)}</option>)}
              </select>
            </label>
            {/* a month that would overlap another period cannot be chosen */}
            <MonthPick label={t("period.from")} value={sel.fromMonth} disabled={!canEdit} on={(m) => fitsWith({ fromMonth: m }) && set({ fromMonth: m })} />
            <MonthPick label={t("period.to")} value={sel.toMonth} disabled={!canEdit} on={(m) => fitsWith({ toMonth: m }) && set({ toMonth: m })} />
            {sel.kind === "RestKind" && (
              <label className="pt-field"><span>{t("period.cover")}</span>
                <select value={sel.sets[0]?.setId ?? ""} disabled={!canEdit} onChange={(e) => set({ sets: e.target.value ? [{ setId: e.target.value, share: 1 }] : [] })}>
                  <option value="">{t("period.cover.none")}</option>
                  {[...plantSets(), ...(habitat.plantSets ?? [])].map((s) => <option key={s.id} value={s.id}>{setName(s, lang)}</option>)}
                </select>
              </label>
            )}
          </div>
          <p className="pt-muted">{t(sel.kind === "RestKind" ? "period.rest.hint" : "period.growing.hint")}</p>
          {warnings.map((w) => (
            <p key={w.cropId} className="pt-plansets__deep">
              {t(`period.warn.${w.why}`, { crop: crop(w.cropId), month: w.month ? monthName(w.month, lang, true) : "—" })}
            </p>
          ))}
          {canEdit && (
            <ConfirmButton label={t("period.remove")} says={t("period.remove.says", { name: sel.name, n: periodCells(habitat, bed.id, sel.id).length })}
              onConfirm={() => {
                edit((h) => ({ ...h, periods: (h.periods ?? []).filter((p) => p.id !== sel.id), cells: h.cells.filter((c) => c.periodId !== sel.id) }));
                setPeriod("");
              }} />
          )}
        </div>
      )}
    </div>
  );
}

/** The period a bed's card opens on: the one this month lies in, else the bed as it stands, else its first. */
export function startPeriod(habitat: Habitat, bed: Bed, today = new Date()): string {
  const periods = periodsOf(habitat, bed.id);
  const now = periods.find((p) => monthsOf(p).includes(today.getMonth() + 1));
  if (now && now.kind === "GrowingKind") return now.id;
  if (periodCells(habitat, bed.id).length || !periods.length) return "";
  return (periods.find((p) => p.kind === "GrowingKind") ?? periods[0]).id;
}
