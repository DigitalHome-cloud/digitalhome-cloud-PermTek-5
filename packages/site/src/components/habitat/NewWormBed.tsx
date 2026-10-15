import * as React from "react";
import {
  WORMBED5_SIZES, bedLoad, defaultOffset, loadClass, newGuild, newId, newWormBedFarm, wormBedParts, wormBoxCm, wormBoxYear,
} from "@dlab5/permtek5-core";
import type { Bed, Exposure, Habitat, Zone, ZoneKind } from "@dlab5/permtek5-core";
import { useT } from "../../lib/i18n";

type Edit = (f: (h: Habitat) => Habitat) => void;

/** The places a WormBed5 stands for now (docs/adr/0028); greenhouses come later. */
export const PLACES: ZoneKind[] = ["RoofZone", "BalconyZone", "GroundZone"];
const SUNS: Exposure[] = ["FullSun", "HalfShade", "Shade"];

/** The household sizes to choose from, up to the first that gets the largest box the bed takes (more get no bigger box). */
export function boxOptions(widthCm: number, lengthCm: number): { n: number; cm: number; max: boolean }[] {
  const out: { n: number; cm: number; max: boolean }[] = [];
  for (let n = 1; n <= 8; n++) {
    const cm = wormBoxCm(n, widthCm, lengthCm), max = cm === wormBoxCm(99, widthCm, lengthCm);
    out.push({ n, cm, max });
    if (max) break;
  }
  return out;
}

/**
 * A new WormBed5, step by step (docs/adr/0028): one bed or a farm of beds, where it stands, a size the gantry works,
 * and a worm box sized by the household. Only the sizes offered can be chosen; the bed's own card fine-tunes later.
 */
export function NewWormBed({ habitat, edit, onDone }: { habitat: Habitat; edit: Edit; onDone?: () => void }) {
  const { t } = useT();
  const [farm, setFarm] = React.useState(false);
  const [zoneId, setZoneId] = React.useState(habitat.zones[0]?.id ?? "new");
  const [place, setPlace] = React.useState<ZoneKind>("RoofZone");
  const [sun, setSun] = React.useState<Exposure>("FullSun");
  const [windy, setWindy] = React.useState(false);
  const [s, setS] = React.useState({ lengthCm: 300, widthCm: 100, depthCm: 15, people: 2, tank: true, rows: 1, perRow: 3, pathCm: 60 });
  const set = (patch: Partial<typeof s>) => setS({ ...s, ...patch });
  // a household above the largest box gets the largest box
  const people = Math.min(s.people, boxOptions(s.widthCm, s.lengthCm).slice(-1)[0].n);
  const wormBinCm = wormBoxCm(people, s.widthCm, s.lengthCm);
  const size = { lengthCm: s.lengthCm, widthCm: s.widthCm, depthCm: s.depthCm, wormBinCm, tank: s.tank };
  const sample: Bed = { id: "", name: "", zoneId: "", cellCm: WORMBED5_SIZES.cellCm, substrate: place === "GroundZone" ? "GardenSoil" : "LightweightRoofSubstrate", ...size, ...wormBedParts(size) };
  const load = bedLoad(sample);
  const year = wormBoxYear(sample);
  const onRoof = (zoneId === "new" ? place : habitat.zones.find((z) => z.id === zoneId)?.kind) !== "GroundZone";
  const beds = farm ? s.rows * s.perRow : 1;

  const create = () => {
    edit((h) => {
      const zone: Zone = h.zones.find((z) => z.id === zoneId) ?? {
        id: newId("zone"), name: t(`hab.kind.${place}`), kind: place, exposure: [sun, ...(windy ? ["Windy" as Exposure] : [])], offsetC: defaultOffset(place),
      };
      const zones = h.zones.some((z) => z.id === zone.id) ? h.zones : [...h.zones, zone];
      if (farm) {
        const made = newWormBedFarm(zone, t("farm.default", { n: (h.farms ?? []).length + 1 }), s.rows, s.perRow, { ...size, pathCm: s.pathCm });
        return { ...h, zones, farms: [...(h.farms ?? []), made.farm], guilds: [...(h.guilds ?? []), ...made.guilds], beds: [...h.beds, ...made.beds] };
      }
      const made = newGuild(zone, t("hab.guild.default", { area: zone.name }), t("hab.bed.default"));
      const bed: Bed = { ...made.bed, lengthCm: s.lengthCm, widthCm: s.widthCm, cellCm: WORMBED5_SIZES.cellCm, ...wormBedParts(size) };
      return { ...h, zones, guilds: [...(h.guilds ?? []), made.guild], beds: [...h.beds, bed] };
    });
    onDone?.();
  };

  const chips = <T extends string | number | boolean>(value: T, options: T[], label: (o: T) => string, on: (o: T) => void, name: string) => (
    <div className="pt-habitat__chips" role="radiogroup" aria-label={name}>
      {options.map((o) => (
        <button key={String(o)} type="button" role="radio" aria-checked={o === value}
          className={"pt-chip" + (o === value ? " pt-chip--on" : "")} onClick={() => on(o)}>{label(o)}</button>
      ))}
    </div>
  );

  return (
    <div className="pt-panel pt-wizard">
      <h2 className="pt-panel__title">{t("wb.title")}</h2>

      <fieldset className="pt-wizard__step">
        <legend>1 · {t("wb.what")}</legend>
        {chips(farm, [false, true], (o) => t(o ? "wb.what.farm" : "wb.what.single"), setFarm, t("wb.what"))}
        <p className="pt-muted">{t(farm ? "wb.what.farm.hint" : "wb.what.single.hint")}</p>
      </fieldset>

      <fieldset className="pt-wizard__step">
        <legend>2 · {t("wb.where")}</legend>
        {habitat.zones.length > 0 && (
          <label className="pt-field"><span>{t("wb.where.area")}</span>
            <select value={zoneId} onChange={(e) => setZoneId(e.target.value)}>
              {habitat.zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
              <option value="new">{t("wb.where.new")}</option>
            </select>
          </label>
        )}
        {zoneId === "new" && (
          <>
            {chips(place, PLACES, (o) => t(`hab.kind.${o}`), setPlace, t("wb.where"))}
            {chips(sun, SUNS, (o) => t(`hab.exp.${o}`), setSun, t("hab.exposure"))}
            <label className="pt-guild__check"><input type="checkbox" checked={windy} onChange={(e) => setWindy(e.target.checked)} /> {t("hab.exp.Windy")}</label>
            <p className="pt-muted">{t("wb.where.hint")}</p>
          </>
        )}
      </fieldset>

      <fieldset className="pt-wizard__step">
        <legend>3 · {t("wb.size")}</legend>
        <div className="pt-habitat__fields">
          <Pick label={t("hab.bed.length")} value={s.lengthCm} options={WORMBED5_SIZES.lengthsCm} unit="cm" on={(v) => set({ lengthCm: v })} />
          <Pick label={t("hab.bed.width")} value={s.widthCm} options={WORMBED5_SIZES.widthsCm} unit="cm" on={(v) => set({ widthCm: v })} />
          <Pick label={t("hab.bed.depth")} value={s.depthCm} options={WORMBED5_SIZES.depthsCm} unit="cm" on={(v) => set({ depthCm: v })} />
          {farm && <Pick label={t("farm.rows")} value={s.rows} options={[1, 2, 3, 4, 5]} on={(v) => set({ rows: v })} />}
          {farm && <Pick label={t("farm.perRow")} value={s.perRow} options={[1, 2, 3, 4, 5, 6]} on={(v) => set({ perRow: v })} />}
          {farm && <Pick label={t("farm.pathCm")} value={s.pathCm} options={WORMBED5_SIZES.pathsCm} unit="cm" on={(v) => set({ pathCm: v })} />}
        </div>
        <p className="pt-muted">{t(`wb.depth.${s.depthCm}`)}</p>
        <label className="pt-guild__check"><input type="checkbox" checked={s.tank} onChange={(e) => set({ tank: e.target.checked })} /> {t("wb.tank")}</label>
        <p className="pt-muted">{t("wb.size.hint")}</p>
      </fieldset>

      <fieldset className="pt-wizard__step">
        <legend>4 · {t("wb.box")}</legend>
        <label className="pt-field"><span>{t("wb.box.people")}</span>
          <select value={people} onChange={(e) => set({ people: Number(e.target.value) })}>
            {boxOptions(s.widthCm, s.lengthCm).map(({ n, cm, max }) => <option key={n} value={n}>{t(max ? "wb.box.option.max" : n === 1 ? "wb.box.option.one" : "wb.box.option", { n, cm })}</option>)}
          </select>
        </label>
        <p className="pt-muted">{t("wb.box.year", { cm: wormBinCm, kg: year.scrapsKg, castings: year.castingsKg, uses: year.bedUsesKg })}</p>
      </fieldset>

      <p className={`pt-bedload${onRoof ? ` pt-bedload--${loadClass(load.kgPerM2)}` : ""}`}>
        <strong>{t("wb.summary", { n: beds, l: s.lengthCm, w: s.widthCm, d: s.depthCm, box: wormBinCm })}</strong>
        {" · "}{t("hab.load", { kg: load.totalKg, m2: load.kgPerM2 })}
        {onRoof && <span className="pt-muted"> · {t(`hab.load.${loadClass(load.kgPerM2)}`)} {t("hab.load.check")}</span>}
      </p>
      <p className="pt-habitat__actions">
        <button className="pt-button" onClick={create}>{t(farm ? "wb.create.farm" : "wb.create")}</button>
        {onDone && <button className="pt-button pt-button--ghost" onClick={onDone}>{t("hab.confirm.no")}</button>}
      </p>
      <p className="pt-muted">{t("wb.next")}</p>
    </div>
  );
}

/** A size from the ones offered; a value set earlier that is not among them stays choosable. */
export function Pick({ label, value, options, unit, on, disabled }: {
  label: string; value: number; options: readonly number[]; unit?: string; on: (v: number) => void; disabled?: boolean;
}) {
  const all = options.includes(value) ? options : [...options, value].sort((a, b) => a - b);
  return (
    <label className="pt-field"><span>{label}</span>
      <select value={value} disabled={disabled} onChange={(e) => on(Number(e.target.value))}>
        {all.map((o) => <option key={o} value={o}>{o}{unit ? ` ${unit}` : ""}</option>)}
      </select>
    </label>
  );
}
