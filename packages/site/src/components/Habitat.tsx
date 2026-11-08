import * as React from "react";
import { areaOfHomeId, climateMonths, frostFreeMonths, portalUrl } from "@dlab5/permtek5-core";
import type { ClimateMonth, Tenant } from "@dlab5/permtek5-core";
import { refreshGroups } from "./AuthGate";
import { listSpaces, startForHome } from "../lib/data";
import { coreAvailable, getArea, getAreaClimate, getHome, mySub } from "../lib/dhcCore";
import type { Area, Home } from "../lib/dhcCore";
import { appInfo } from "../lib/about";
import { useT } from "../lib/i18n";

/**
 * A habitat: the permaculture side of one DigitalHome.Cloud home (docs/adr/0015).
 *
 * The Portal opens this site with `?home=<smartHomeId>`. If the home already
 * has a habitat this person belongs to, it is shown; if they own the home,
 * they can start one (or join the one a co-owner started); anyone else is told
 * who can. The home and its climate are read from DHC core, never copied.
 */

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

export const HomeEntry: React.FC<{ homeId: string; tenants: Tenant[] | null }> = ({ homeId, tenants }) => {
  const { t } = useT();
  const id = homeId.trim().toUpperCase();
  const tenant = tenants?.find((x) => x.smartHomeId === id) ?? null;
  const [home, setHome] = React.useState<Home | null | undefined>(undefined);
  const [owner, setOwner] = React.useState(false);
  const [name, setName] = React.useState(t("habitat.start.default"));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!tenants || tenant) return;
    Promise.all([getHome(id), mySub()])
      .then(([h, sub]) => {
        setHome(h);
        setOwner(!!h && !!sub && (h.owners ?? []).includes(sub));
      })
      .catch((e: unknown) => { setHome(null); setError(errText(e)); });
  }, [id, tenants, tenant]);

  if (!tenants) return null;
  if (tenant) return <HabitatPanel tenant={tenant} />;
  if (!coreAvailable()) return <div className="pt-panel"><p className="pt-panel__hint">{t("habitat.noCore")}</p></div>;
  if (home === undefined) return <p className="pt-muted">{t("lib.loading")}</p>;

  const start = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await startForHome(id, name);
      await refreshGroups();          // now its admin: new groups need a new token
    } catch (err) {
      setError(errText(err));
      setBusy(false);
    }
  };

  return (
    <section className="pt-panel" aria-labelledby="habitat-start">
      <h2 className="pt-panel__title" id="habitat-start">{t("habitat.start.title")}</h2>
      {owner ? (
        <form className="pt-habitat__start" onSubmit={start}>
          <p className="pt-panel__hint">{t("habitat.start.hint")}</p>
          <label className="pt-field">
            <span>{t("habitat.start.name")}</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
          </label>
          <div><button className="pt-button" type="submit" disabled={busy}>{t("habitat.start.button")}</button></div>
        </form>
      ) : (
        <p className="pt-panel__hint">{t("habitat.notOwner")}</p>
      )}
      {error && <p className="pt-error" role="alert">{error}</p>}
      {home && <ClimateCard areaId={`${home.country}-${home.postalCode}`} />}
    </section>
  );
};

/** One habitat: its shared space and its area's climate. */
export const HabitatPanel: React.FC<{ tenant: Tenant }> = ({ tenant }) => {
  const { t } = useT();
  const [shared, setShared] = React.useState<string | null>(null);
  const [areaId, setAreaId] = React.useState<string | null>(tenant.smartHomeId ? areaOfHomeId(tenant.smartHomeId) : null);

  React.useEffect(() => {
    listSpaces()
      .then((ss) => setShared(ss.find((s) => s.tenantId === tenant.id && s.kind === "shared")?.id ?? null))
      .catch(() => setShared(null));
    // An id that does not carry its area: ask the core (owners only).
    if (!areaId && tenant.smartHomeId) {
      getHome(tenant.smartHomeId).then((h) => h && setAreaId(`${h.country}-${h.postalCode}`)).catch(() => undefined);
    }
  }, [tenant.id]);

  return (
    <section className="pt-panel" aria-labelledby={`habitat-${tenant.id}`}>
      <h2 className="pt-panel__title" id={`habitat-${tenant.id}`}>{tenant.name}</h2>
      <p className="pt-panel__hint">{t("habitat.hint")}</p>
      {shared && <div><a className="pt-button" href={`/w/${shared}/`}>{t("habitat.open")}</a></div>}
      {areaId ? <ClimateCard areaId={areaId} /> : <p className="pt-muted">{t("climate.noArea")}</p>}
    </section>
  );
};

const fmt = (v: number | null, digits = 0) => (v === null ? "–" : v.toFixed(digits));

/** The area's monthly normals, from DHC core's weather gold. */
export const ClimateCard: React.FC<{ areaId: string }> = ({ areaId }) => {
  const { t, lang } = useT();
  const [area, setArea] = React.useState<Area | null>(null);
  const [months, setMonths] = React.useState<ClimateMonth[] | null | undefined>(undefined);

  React.useEffect(() => {
    setMonths(undefined);
    getArea(areaId).then(setArea).catch(() => setArea(null));
    getAreaClimate(areaId)
      .then((c) => setMonths(c ? climateMonths(c.climate, c.solar, c.wind) : null))
      .catch(() => setMonths(null));
  }, [areaId]);

  const monthName = (m: number) => new Date(2001, m - 1, 1).toLocaleString(lang, { month: "short" });
  const ff = months ? frostFreeMonths(months) : null;
  const areaLink = `${portalUrl(appInfo().environment)}/area/?id=${encodeURIComponent(areaId)}`;
  const rows: [string, (m: ClimateMonth) => string][] = [
    [t("climate.max"), (m) => fmt(m.maxC)],
    [t("climate.mean"), (m) => fmt(m.meanC)],
    [t("climate.min"), (m) => fmt(m.minC)],
    [t("climate.rain"), (m) => fmt(m.rainMm)],
    [t("climate.sun"), (m) => fmt(m.sunKwhM2, 1)],
    [t("climate.wind"), (m) => fmt(m.windMs, 1)],
  ];

  return (
    <div className="pt-climate">
      <h3 className="pt-panel__sub">{t("climate.title", { area: area?.name ?? areaId })}</h3>
      {months === undefined && <p className="pt-muted">{t("lib.loading")}</p>}
      {months === null && <p className="pt-muted">{t("climate.none")}</p>}
      {months && (
        <>
          <p className="pt-panel__hint">
            {ff ? t("climate.frostFree", { from: monthName(ff.from), to: monthName(ff.to) }) : t("climate.noFrostFree")}
          </p>
          <div className="pt-climate__scroll">
            <table className="pt-table pt-climate__table">
              <thead>
                <tr><th scope="col" />{months.map((m) => <th scope="col" key={m.month}>{monthName(m.month)}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map(([label, cell]) => (
                  <tr key={label}>
                    <th scope="row">{label}</th>
                    {months.map((m) => (
                      <td key={m.month} className={label === t("climate.min") && m.frostRisk ? (m.frost ? "pt-climate--frost" : "pt-climate--cold") : undefined}>
                        {cell(m)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="pt-muted pt-climate__source">
        {t("climate.source")} <a href={areaLink} target="_blank" rel="noopener noreferrer">{t("climate.portal")}</a>
      </p>
    </div>
  );
};
