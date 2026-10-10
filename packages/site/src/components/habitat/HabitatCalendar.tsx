import * as React from "react";
import { activitiesIn, cropById, cropName, deriveWindows, whatNow, zoneOffset } from "@dlab5/permtek5-core";
import type { Activity, ClimateMonth, CropCalendar, Habitat } from "@dlab5/permtek5-core";
import { useT } from "../../lib/i18n";
import { cropColor } from "./common";

const ORDER: Activity[] = ["SowIndoors", "SowOutdoors", "PlantOut", "Flowering", "WinterPrune", "SummerPrune", "Harvest"];

function monthNames(lang: string) {
  return Array.from({ length: 12 }, (_, i) => new Date(2001, i, 1).toLocaleString(lang, { month: "short" }));
}

/** Without the area's climate, annuals have no derived months: say so once. */
function ClimateNote({ months, areaName }: { months: ClimateMonth[] | null; areaName: string | null }) {
  const { t } = useT();
  return (
    <p className="pt-panel__hint">
      {months ? t("cal.basis", { area: areaName ?? "" }) : t("cal.noClimate")} {t("cal.toConfirm")}
    </p>
  );
}

/** Every crop and tree of the habitat, month by month, per zone. */
export function HabitatCalendar({ habitat, months, areaName }: { habitat: Habitat; months: ClimateMonth[] | null; areaName: string | null }) {
  const { t, lang } = useT();
  const names = monthNames(lang);
  const now = new Date().getMonth() + 1;
  const rows = new Map<string, { cropId: string; zoneId: string; cal: CropCalendar }>();
  const add = (cropId: string, zoneId: string) => {
    const crop = cropById(cropId);
    const key = `${cropId}|${zoneId}`;
    if (crop && !rows.has(key)) rows.set(key, { cropId, zoneId, cal: deriveWindows(months, crop, zoneOffset(habitat, zoneId)) });
  };
  for (const c of habitat.cells) add(c.cropId, habitat.beds.find((b) => b.id === c.bedId)?.zoneId ?? "");
  for (const p of habitat.plants) add(p.cropId, p.zoneId);
  const zoneName = (id: string) => habitat.zones.find((z) => z.id === id)?.name ?? "";

  if (!rows.size) return <div className="pt-empty"><p>{t("cal.empty")}</p></div>;
  return (
    <div className="pt-panel">
      <ClimateNote months={months} areaName={areaName} />
      <div className="pt-climate__scroll">
        <table className="pt-table pt-cal">
          <thead>
            <tr><th scope="col">{t("hab.crop")}</th>
              {names.map((n, i) => <th scope="col" key={n} className={i + 1 === now ? "pt-cal__now" : undefined}>{n}</th>)}</tr>
          </thead>
          <tbody>
            {[...rows.values()].map(({ cropId, zoneId, cal }) => (
              <tr key={`${cropId}|${zoneId}`}>
                <th scope="row">
                  <span className="pt-cal__dot" style={{ background: cropColor(cropId) }} />
                  {cropName(cropById(cropId)!, lang)} <span className="pt-muted">· {zoneName(zoneId)}</span>
                  {cal.basis === "none" && <span className="pt-muted"> · {t("cal.noRule")}</span>}
                </th>
                {names.map((n, i) => {
                  const acts = activitiesIn(cal, i + 1);
                  return (
                    <td key={n} className={i + 1 === now ? "pt-cal__now" : undefined}>
                      {acts.map((a) => (
                        <span key={a} className={`pt-cal__act pt-cal__act--${a}` + (a === "Flowering" && cal.lateFrost.includes(i + 1) ? " pt-cal__act--frost" : "")}
                          title={t(`act.${a}`)}>{t(`act.short.${a}`)}</span>
                      ))}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="pt-cal__legend">
        {ORDER.map((a) => <span key={a}><span className={`pt-cal__act pt-cal__act--${a}`}>{t(`act.short.${a}`)}</span> {t(`act.${a}`)}</span>)}
        <span><span className="pt-cal__act pt-cal__act--Flowering pt-cal__act--frost">{t("act.short.Flowering")}</span> {t("cal.lateFrost")}</span>
      </p>
    </div>
  );
}

/** This month's work, and what the beds could still take. */
export function HabitatNow({ habitat, months, areaName }: { habitat: Habitat; months: ClimateMonth[] | null; areaName: string | null }) {
  const { t, lang } = useT();
  const [month, setMonth] = React.useState(new Date().getMonth() + 1);
  const names = monthNames(lang);
  const items = whatNow(habitat, months, month);
  const label = (id: string) =>
    habitat.plants.find((p) => p.id === id)?.name ?? habitat.beds.find((b) => b.id === id)?.name ?? null;
  const where = (subjects: string[], zoneId: string) => {
    const named = subjects.map(label).filter(Boolean);
    const zone = habitat.zones.find((z) => z.id === zoneId)?.name ?? "";
    return named.length ? `${named.join(", ")} · ${zone}` : `${subjects.length === 1 ? t("now.cell") : t("now.cells", { n: subjects.length })} · ${zone}`;
  };
  const todo = items.filter((i) => !i.suggestion);
  const could = items.filter((i) => i.suggestion);
  return (
    <div className="pt-panel">
      <label className="pt-field pt-now__month"><span>{t("now.month")}</span>
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {names.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}
        </select>
      </label>
      <ClimateNote months={months} areaName={areaName} />
      <h2 className="pt-panel__sub">{t("now.todo")}</h2>
      {todo.length === 0 ? <p className="pt-muted">{t("now.nothing")}</p> : (
        <ul className="pt-now">
          {todo.map((i, k) => (
            <li key={k} className={i.lateFrost ? "pt-now__frost" : undefined}>
              <span className={`pt-cal__act pt-cal__act--${i.activity}`}>{t(`act.short.${i.activity}`)}</span>{" "}
              <strong>{t(`act.${i.activity}`)}</strong>: {cropName(cropById(i.cropId)!, lang)}
              <span className="pt-muted"> · {where(i.subjects, i.zoneId)}</span>
              {i.lateFrost && <div className="pt-now__warn">{t("now.lateFrost")}</div>}
            </li>
          ))}
        </ul>
      )}
      {could.length > 0 && (
        <>
          <h2 className="pt-panel__sub">{t("now.could")}</h2>
          <p className="pt-now__could">
            {could.map((i, k) => (
              <span key={k} className="pt-chip" title={`${t(`act.${i.activity}`)} · ${where(i.subjects, i.zoneId)}`}>
                {cropName(cropById(i.cropId)!, lang)} ({t(`act.short.${i.activity}`)})
              </span>
            ))}
          </p>
        </>
      )}
    </div>
  );
}
