import * as React from "react";
import { VALVE_KINDS, defaultWater, waterBudget } from "@dlab5/permtek5-core";
import type { ClimateMonth, Guild, Habitat, ValveKind, WaterStore } from "@dlab5/permtek5-core";
import { useT } from "../../lib/i18n";
import { num } from "./common";

type Edit = (f: (h: Habitat) => Habitat) => void;

/**
 * A guild's water (docs/adr/0025): rain from a roof into a barrel whose tap refills the tank pipes, and the worm
 * box's sump with a valve to the tank pipes and one to a garden tank. Shown as its flows, editable, and with the
 * month-by-month budget from the area's climate: what the bed uses, what rain brings, what is lost.
 */
export function GuildWater({ guild, habitat, edit, canEdit, months }: {
  guild: Guild; habitat: Habitat; edit: Edit; canEdit: boolean; months: ClimateMonth[] | null;
}) {
  const { t } = useT();
  const stores = (habitat.stores ?? []).filter((s) => s.guildId === guild.id);
  const catchments = (habitat.catchments ?? []).filter((c) => c.guildId === guild.id);
  const valves = (habitat.valves ?? []).filter((v) => v.guildId === guild.id);
  const bed = habitat.beds.find((b) => b.guildId === guild.id);
  const byId = new Map(stores.map((s) => [s.id, s]));
  const nameOf = (id: string) => byId.get(id)?.name ?? "?";

  const add = () => bed && edit((h) => {
    const w = defaultWater(guild, bed, {
      roof: t("water.default.roof"), barrel: t("water.default.barrel"), pipes: t("water.default.pipes"), sump: t("water.default.sump"),
      garden: t("water.default.garden"), barrelTap: t("water.default.barrelTap"), sumpBed: t("water.default.sumpBed"), sumpGarden: t("water.default.sumpGarden"),
    });
    return { ...h, catchments: [...(h.catchments ?? []), ...w.catchments], stores: [...(h.stores ?? []), ...w.stores], valves: [...(h.valves ?? []), ...w.valves] };
  });
  const remove = () => edit((h) => ({
    ...h, catchments: (h.catchments ?? []).filter((c) => c.guildId !== guild.id), stores: (h.stores ?? []).filter((s) => s.guildId !== guild.id),
    valves: (h.valves ?? []).filter((v) => v.guildId !== guild.id),
  }));
  const setStore = (id: string, patch: Partial<WaterStore>) => edit((h) => ({ ...h, stores: (h.stores ?? []).map((s) => (s.id === id ? { ...s, ...patch } : s)) }));

  if (!stores.length && !catchments.length) {
    return (
      <details className="pt-guide pt-water">
        <summary>{t("water.title")}</summary>
        <p className="pt-muted">{t("water.none")}</p>
        {canEdit && bed && <p><button className="pt-button pt-button--ghost" onClick={add}>{t("water.add")}</button></p>}
      </details>
    );
  }

  const budget = months ? waterBudget(habitat, guild.id, months) : null;
  const lostMonths = budget ? budget.months.filter((m) => (m.lostL ?? 0) > 0).length : 0;
  const dryMonths = budget ? budget.months.slice(3, 9).filter((m) => (m.refills ?? 1) < 0.25).length : 0;
  const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2026, i, 1).toLocaleString(undefined, { month: "short" }));

  return (
    <details className="pt-guide pt-water" open>
      <summary>{t("water.title")}</summary>
      <ul className="pt-water__flows">
        {catchments.map((c) => (
          <li key={c.id}>
            <strong>{c.name}</strong>
            {canEdit
              ? <input className="pt-input pt-water__num" type="number" min={0.5} step={0.5} value={c.m2} aria-label={t("water.m2")}
                  onChange={(e) => edit((h) => ({ ...h, catchments: (h.catchments ?? []).map((x) => (x.id === c.id ? { ...x, m2: num(e.target.value) ?? x.m2 } : x)) }))} />
              : <span> {c.m2}</span>} m² · {t("water.runoff", { share: Math.round((c.runoff ?? 0.8) * 100) })}
            <span className="pt-water__arrow" aria-hidden="true"> → </span>{nameOf(c.storeId)} <span className="pt-muted">({t("water.gutter")})</span>
          </li>
        ))}
        {valves.map((v) => (
          <li key={v.id}>
            {nameOf(v.from)}<span className="pt-water__arrow" aria-hidden="true"> → </span>{nameOf(v.to)} · <strong>{v.name}</strong>{" "}
            {canEdit
              ? <select className="pt-input" value={v.kind} aria-label={t("water.valveKind")}
                  onChange={(e) => edit((h) => ({ ...h, valves: (h.valves ?? []).map((x) => (x.id === v.id ? { ...x, kind: e.target.value as ValveKind } : x)) }))}>
                  {VALVE_KINDS.map((k) => <option key={k} value={k}>{t(`water.valve.${k}`)}</option>)}
                </select>
              : <span className="pt-muted">{t(`water.valve.${v.kind}`)}</span>}
            {byId.get(v.from)?.holds.includes("WormLiquid") && <span className="pt-badge pt-water__worm">{t("water.wormLiquid")}</span>}
          </li>
        ))}
      </ul>
      <table className="pt-table pt-water__stores">
        <thead><tr><th scope="col">{t("water.store")}</th><th scope="col">{t("water.kind")}</th><th scope="col">{t("water.litres")}</th><th scope="col">{t("water.area")}</th></tr></thead>
        <tbody>
          {stores.map((s) => (
            <tr key={s.id}>
              <th scope="row">{s.name}</th>
              <td>{t(`water.kind.${s.kind}`)}{s.holds.includes("WormLiquid") ? "" : ` · ${t("water.cleanOnly")}`}</td>
              <td>{canEdit && s.kind !== "TankPipes" && s.kind !== "WormBoxSump"
                ? <input className="pt-input pt-water__num" type="number" min={0} step={10} value={s.capacityL ?? 0} aria-label={t("water.litres")}
                    onChange={(e) => setStore(s.id, { capacityL: num(e.target.value) ?? 0 })} />
                : `${Math.round(s.capacityL ?? 0)} l`}</td>
              <td>{canEdit && s.kind === "GardenTank"
                ? <select className="pt-input" value={s.zoneId ?? guild.zoneId} aria-label={t("water.area")}
                    onChange={(e) => setStore(s.id, { zoneId: e.target.value === guild.zoneId ? undefined : e.target.value })}>
                    {habitat.zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
                  </select>
                : habitat.zones.find((z) => z.id === (s.zoneId ?? guild.zoneId))?.name ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {budget ? (
        <>
          <p>{t("water.budget", { share: budget.seasonSharePct ?? "–" })}</p>
          <div className="pt-climate__scroll">
            <table className="pt-table pt-water__budget">
              <thead><tr><th scope="col"></th>{MONTHS.map((m) => <th scope="col" key={m}>{m}</th>)}</tr></thead>
              <tbody>
                <tr><th scope="row">{t("water.need")}</th>{budget.months.map((m) => <td key={m.month}>{m.needL ?? "–"}</td>)}</tr>
                <tr><th scope="row">{t("water.rainOnBed")}</th>{budget.months.map((m) => <td key={m.month}>{m.rainOnBedL ?? "–"}</td>)}</tr>
                <tr><th scope="row">{t("water.caught")}</th>{budget.months.map((m) => <td key={m.month}>{m.caughtL ?? "–"}</td>)}</tr>
                <tr><th scope="row">{t("water.share")}</th>{budget.months.map((m) => <td key={m.month}>{m.rainSharePct == null ? "–" : `${m.rainSharePct} %`}</td>)}</tr>
              </tbody>
            </table>
          </div>
          {lostMonths >= 6 && <p className="pt-muted">{t("water.warn.lost", { n: lostMonths })}</p>}
          {dryMonths >= 3 && <p className="pt-muted">{t("water.warn.dry", { n: dryMonths })}</p>}
          <p className="pt-panel__hint">{t("water.note")}</p>
        </>
      ) : <p className="pt-muted">{t("cal.noClimate")}</p>}
      {canEdit && <p><button className="pt-button pt-button--ghost" onClick={remove}>{t("water.remove")}</button></p>}
    </details>
  );
}

