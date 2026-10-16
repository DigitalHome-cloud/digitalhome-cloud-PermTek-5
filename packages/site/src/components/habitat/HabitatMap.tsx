import * as React from "react";
import {
  EXPOSURES, ROBOT_NAME, SUBSTRATE_KINDS, WORMBED5_SIZES, bedGrid, bedLoad, loadClass, guildForBed, wormBinCols, cropById, cropName, footprint, newId, sowingJob,
  crowdedCells, layerOf, plantingConflict, removeZone, wormBoxCm, wormBoxYear, zoneContents,
} from "@dlab5/permtek5-core";
import type { Bed, Cell, CellStatus, ClimateMonth, Exposure, GardenPlant, Guild, Habitat, SubstrateKind, Zone, ZoneKind } from "@dlab5/permtek5-core";
import { FarmCard } from "./FarmCard";
import { NewWormBed, PLACES, Pick, boxOptions } from "./NewWormBed";
import { PlanFromSets } from "./PlantSets";
import { CELL_STATUSES } from "@dlab5/permtek5-core";
import { useT } from "../../lib/i18n";
import { ConfirmButton, CropSelect, cropColor, num } from "./common";
import { FeedingGuide } from "./FeedingGuide";
import { GuildWater } from "./GuildWater";

type Edit = (f: (h: Habitat) => Habitat) => void;


/**
 * The site's WormBed5 guilds, by area (docs/adr/0028). A map starts empty: a person says what they build (one
 * WormBed5 or a farm of them), where it stands and how big, and plans it from plant sets. Other uses come later.
 */
export { BedEditor, GuildCard };

export function HabitatMap({ habitat, edit, canEdit, months = null }: {
  habitat: Habitat; edit: Edit; canEdit: boolean; replace?: (h: Habitat) => void; months?: ClimateMonth[] | null;
}) {
  const { t } = useT();
  const [adding, setAdding] = React.useState(false);
  const empty = habitat.zones.length === 0;
  return (
    <div className="pt-habitat">
      <details className="pt-howto" open={empty}>
        <summary>{t("wb.how")}</summary>
        <ol>{[1, 2, 3, 4, 5].map((n) => <li key={n}>{t(`wb.how.${n}`)}</li>)}</ol>
      </details>
      {empty && !canEdit && <p className="pt-empty">{t("hab.empty")}</p>}
      {empty && canEdit && <NewWormBed habitat={habitat} edit={edit} />}
      {habitat.zones.map((z) => <ZoneCard key={z.id} zone={z} habitat={habitat} edit={edit} canEdit={canEdit} months={months} />)}
      {canEdit && !empty && (adding
        ? <NewWormBed habitat={habitat} edit={edit} onDone={() => setAdding(false)} />
        : <p className="pt-habitat__actions"><button className="pt-button" onClick={() => setAdding(true)}>+ {t("wb.add")}</button></p>)}
    </div>
  );
}

function ZoneCard({ zone, habitat, edit, canEdit, months }: { zone: Zone; habitat: Habitat; edit: Edit; canEdit: boolean; months: ClimateMonth[] | null }) {
  const { t } = useT();
  const set = (patch: Partial<Zone>) => edit((h) => ({ ...h, zones: h.zones.map((z) => (z.id === zone.id ? { ...z, ...patch } : z)) }));
  const beds = habitat.beds.filter((b) => b.zoneId === zone.id);
  const plants = habitat.plants.filter((p) => p.zoneId === zone.id);
  const toggle = (e: Exposure) => set({ exposure: zone.exposure.includes(e) ? zone.exposure.filter((x) => x !== e) : [...zone.exposure, e].sort() });
  const farms = (habitat.farms ?? []).filter((f) => f.zoneId === zone.id);
  // what goes with the area when it is removed (docs/adr/0028)
  const inside = zoneContents(habitat, zone.id);
  const empty = !inside.guilds.size && !inside.farms.size && !inside.beds.size && !inside.plants;
  // a farm's guilds show in the farm
  const inFarm = new Set(beds.filter((b) => b.farmId && farms.some((f) => f.id === b.farmId)).map((b) => b.guildId));
  const guilds = (habitat.guilds ?? []).filter((g) => g.zoneId === zone.id && !inFarm.has(g.id));
  const plainBeds = beds.filter((b) => (!b.guildId || !guilds.some((g) => g.id === b.guildId)) && (!b.farmId || !farms.some((f) => f.id === b.farmId)));

  return (
    <section className="pt-panel" aria-label={zone.name}>
      <div className="pt-habitat__zonehead">
        {canEdit
          ? <input className="pt-input pt-habitat__name" value={zone.name} onChange={(e) => set({ name: e.target.value })} aria-label={t("hab.name")} />
          : <h2 className="pt-panel__title">{zone.name}</h2>}
        <span className="pt-badge">{t(`hab.kind.${zone.kind}`)}</span>
      </div>
      <div className="pt-habitat__fields">
        <label className="pt-field"><span>{t("hab.kind")}</span>
          <select value={zone.kind} disabled={!canEdit} onChange={(e) => set({ kind: e.target.value as ZoneKind })}>
            {(PLACES.includes(zone.kind) ? PLACES : [...PLACES, zone.kind]).map((k) => <option key={k} value={k}>{t(`hab.kind.${k}`)}</option>)}
          </select>
        </label>
        <label className="pt-field"><span>{t("hab.area")}</span>
          <input type="number" min={0} step={0.5} disabled={!canEdit} value={zone.areaM2 ?? ""} onChange={(e) => set({ areaM2: num(e.target.value) })} />
        </label>
        <label className="pt-field"><span>{t("hab.offset")}</span>
          <input type="number" min={-5} max={5} step={0.5} disabled={!canEdit} value={zone.offsetC ?? ""} onChange={(e) => set({ offsetC: num(e.target.value) })} />
        </label>
      </div>
      <div className="pt-habitat__chips" role="group" aria-label={t("hab.exposure")}>
        {EXPOSURES.map((e) => (
          <button key={e} type="button" disabled={!canEdit} aria-pressed={zone.exposure.includes(e)}
            className={"pt-chip" + (zone.exposure.includes(e) ? " pt-chip--on" : "")} onClick={() => toggle(e)}>
            {t(`hab.exp.${e}`)}
          </button>
        ))}
      </div>

      {guilds.map((g) => <GuildCard key={g.id} guild={g} habitat={habitat} edit={edit} canEdit={canEdit} months={months} />)}
      {farms.map((f) => <FarmCard key={f.id} farm={f} habitat={habitat} edit={edit} canEdit={canEdit} months={months} />)}
      {plainBeds.map((b) => <BedEditor key={b.id} bed={b} habitat={habitat} edit={edit} canEdit={canEdit} />)}
      {plants.length > 0 && <GardenPlants zone={zone} plants={plants} edit={edit} canEdit={canEdit} />}

      {canEdit && (
        <p className="pt-habitat__actions">
          {empty
            ? <button className="pt-button pt-button--ghost" onClick={() => edit((h) => removeZone(h, zone.id))}>{t("hab.remove.zone")}</button>
            : <ConfirmButton label={t("hab.remove.zone")} says={t("hab.remove.zone.says", { name: zone.name, what: zoneParts(inside).map(([k, n]) => t(`hab.remove.zone.${k}`, { n })).join(", ") })}
                onConfirm={() => edit((h) => removeZone(h, zone.id))} />}
        </p>
      )}
    </section>
  );
}

/** What an area holds, for the remove confirm: only the kinds it has. */
const zoneParts = (i: ReturnType<typeof zoneContents>): [string, number][] =>
  ([["guilds", i.guilds.size], ["farms", i.farms.size], ["beds", i.beds.size], ["cells", i.cells], ["plants", i.plants], ["water", i.water], ["cycles", i.cycles]] as [string, number][])
    .filter(([, n]) => n > 0);

/**
 * A Perma5Guild (docs/adr/0020): the area's working unit. Its type says what it
 * is made of (WormBed5: one bed with a worm box, worked by a Gantry5-gen1); the
 * bed editor inside sets the sizes.
 */
function GuildCard({ guild, habitat, edit, canEdit, months, inFarm = false }: {
  guild: Guild; habitat: Habitat; edit: Edit; canEdit: boolean; months: ClimateMonth[] | null; inFarm?: boolean;
}) {
  const { t } = useT();
  const set = (patch: Partial<Guild>) => edit((h) => ({ ...h, guilds: (h.guilds ?? []).map((g) => (g.id === guild.id ? { ...g, ...patch } : g)) }));
  const beds = habitat.beds.filter((b) => b.guildId === guild.id);
  return (
    <div className="pt-guild">
      <div className="pt-habitat__zonehead">
        {canEdit
          ? <input className="pt-input pt-habitat__name" value={guild.name} onChange={(e) => set({ name: e.target.value })} aria-label={t("hab.name")} />
          : <strong>{guild.name}</strong>}
        <span className="pt-badge">Perma5Guild · {guild.type}</span>
        {guild.robot && <span className="pt-muted pt-guild__robot">{t("hab.guild.robot", { robot: ROBOT_NAME[guild.robot] })}</span>}
      </div>
      <label className="pt-guild__check">
        <input type="checkbox" checked={guild.wormsMayLeave ?? true} disabled={!canEdit} onChange={(e) => set({ wormsMayLeave: e.target.checked })} />
        {t("hab.guild.worms")}
      </label>
      {beds.map((b) => <BedEditor key={b.id} bed={b} habitat={habitat} edit={edit} canEdit={canEdit} />)}
      {guild.type === "WormBed5" && <FeedingGuide />}
      <GuildWater guild={guild} habitat={habitat} edit={edit} canEdit={canEdit} months={months} />
      {canEdit && !inFarm && (
        <p className="pt-habitat__actions">
          <ConfirmButton label={t("hab.remove.guild")}
            says={t("hab.remove.guild.says", {
              beds: beds.length, cells: habitat.cells.filter((c) => beds.some((b) => b.id === c.bedId)).length,
              water: [...(habitat.catchments ?? []), ...(habitat.stores ?? []), ...(habitat.valves ?? [])].filter((x) => x.guildId === guild.id).length,
              cycles: (habitat.cycles ?? []).filter((c) => c.aboutId === guild.id).length,
            })}
            onConfirm={() => edit((h) => {
              const gone = new Set(h.beds.filter((b) => b.guildId === guild.id).map((b) => b.id));
              return {
                ...h, guilds: (h.guilds ?? []).filter((g) => g.id !== guild.id), beds: h.beds.filter((b) => !gone.has(b.id)),
                // its bed's plants, its water and what it was learning go with it
                cells: h.cells.filter((c) => !gone.has(c.bedId)),
                catchments: (h.catchments ?? []).filter((c) => c.guildId !== guild.id), stores: (h.stores ?? []).filter((s) => s.guildId !== guild.id),
                valves: (h.valves ?? []).filter((v) => v.guildId !== guild.id), cycles: (h.cycles ?? []).filter((c) => c.aboutId !== guild.id),
              };
            })} />
        </p>
      )}
    </div>
  );
}

/** A bed as its grid of cells. Choose a crop, then click empty cells to plant it; click a planted cell to edit it. */
function BedEditor({ bed, habitat, edit, canEdit }: { bed: Bed; habitat: Habitat; edit: Edit; canEdit: boolean }) {
  const { t, lang } = useT();
  const [brush, setBrush] = React.useState("");
  const [selected, setSelected] = React.useState<string | null>(null);
  const { rows, cols } = bedGrid(bed);
  const cells = habitat.cells.filter((c) => c.bedId === bed.id);
  // a ground cover may share a cell with a tall plant: the cell shows the tall one
  const at = new Map([...cells].sort((a, b) => Number(layerOf(b.cropId) === "ground") - Number(layerOf(a.cropId) === "ground")).map((c) => [`${c.row}|${c.col}`, c]));
  const crowded = crowdedCells(bed, cells);
  const [refused, setRefused] = React.useState<string | null>(null);
  // cells covered by a planted cell's spacing (shown lighter)
  const covered = new Map<string, Cell>();
  for (const c of cells) {
    const f = footprint(c.cropId, bed);
    const r0 = c.row - Math.floor((f - 1) / 2), c0 = c.col - Math.floor((f - 1) / 2);
    for (let r = r0; r < r0 + f; r++) for (let k = c0; k < c0 + f; k++) if (!at.has(`${r}|${k}`)) covered.set(`${r}|${k}`, c);
  }
  const setBed = (patch: Partial<Bed>) => edit((h) => ({ ...h, beds: h.beds.map((b) => (b.id === bed.id ? { ...b, ...patch } : b)) }));
  const setCell = (id: string, patch: Partial<Cell>) => edit((h) => ({ ...h, cells: h.cells.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  const binFrom = cols - wormBinCols(bed);          // the worm box takes the last columns
  const zone = habitat.zones.find((z) => z.id === bed.zoneId);
  const load = bedLoad(bed);
  // what a roof carries matters on a roof or a balcony, not on the ground
  // a WormBed5 is sized from what is offered, its worm box by the household it takes scraps from (docs/adr/0028)
  const guided = !!bed.guildId;
  const year = wormBoxYear(bed);
  const people = boxOptions(bed.widthCm, bed.lengthCm).find((o) => o.cm === bed.wormBinCm)?.n;
  const onRoof = ["RoofZone", "BalconyZone"].includes(habitat.zones.find((z) => z.id === bed.zoneId)?.kind ?? "");
  const click = (row: number, col: number, force = false) => {
    const here = at.get(`${row}|${col}`);
    setRefused(null);
    if (here && !(brush && layerOf(brush) === "ground" && layerOf(here.cropId) === "tall")) { setSelected(here.id); return; }
    if (!canEdit || !brush || col >= binFrom) return;
    // planting by hand keeps the spacing too (docs/adr/0027); Shift+click plants anyway, and the cell shows as crowded
    const other = plantingConflict(bed, cells, row, col, brush);
    if (other && !force) {
      setRefused(t("hab.cell.tooClose", { crop: cropName(cropById(other.cropId)!, lang), row: other.row + 1, col: other.col + 1 }));
      return;
    }
    const id = newId("cell");
    edit((h) => ({ ...h, cells: [...h.cells, { id, bedId: bed.id, row, col, cropId: brush, status: "CellPlanned" as CellStatus }] }));
    setSelected(id);
  };
  const sel = cells.find((c) => c.id === selected);
  const job = sel ? sowingJob(habitat, sel) : null;
  const crop = sel ? cropById(sel.cropId) : undefined;

  return (
    <div className="pt-bedbox">
      <div className="pt-habitat__fields">
        <label className="pt-field"><span>{t("hab.name")}</span>
          <input value={bed.name} disabled={!canEdit} onChange={(e) => setBed({ name: e.target.value })} />
        </label>
        {guided ? (
          <>
            {/* a WormBed5 takes the sizes the gantry works (docs/adr/0028); a farm's beds share the farm's size */}
            <Pick label={t("hab.bed.length")} value={bed.lengthCm} options={WORMBED5_SIZES.lengthsCm} unit="cm" disabled={!canEdit || !!bed.farmId} on={(v) => setBed({ lengthCm: v })} />
            <Pick label={t("hab.bed.width")} value={bed.widthCm} options={WORMBED5_SIZES.widthsCm} unit="cm" disabled={!canEdit || !!bed.farmId} on={(v) => setBed({ widthCm: v })} />
            <Pick label={t("hab.bed.depth")} value={bed.depthCm ?? 15} options={WORMBED5_SIZES.depthsCm} unit="cm" disabled={!canEdit} on={(v) => setBed({ depthCm: v })} />
          </>
        ) : (
          <>
            <label className="pt-field"><span>{t("hab.bed.length")}</span>
              <input type="number" min={10} step={10} disabled={!canEdit} value={bed.lengthCm} onChange={(e) => setBed({ lengthCm: num(e.target.value) ?? bed.lengthCm })} />
            </label>
            <label className="pt-field"><span>{t("hab.bed.width")}</span>
              <input type="number" min={10} step={10} disabled={!canEdit} value={bed.widthCm} onChange={(e) => setBed({ widthCm: num(e.target.value) ?? bed.widthCm })} />
            </label>
            <label className="pt-field"><span>{t("hab.bed.depth")}</span>
              <input type="number" min={0} step={5} disabled={!canEdit} value={bed.depthCm ?? ""} onChange={(e) => setBed({ depthCm: num(e.target.value) })} />
            </label>
            <label className="pt-field"><span>{t("hab.bed.cell")}</span>
              <input type="number" min={5} max={100} step={5} disabled={!canEdit} value={bed.cellCm} onChange={(e) => setBed({ cellCm: num(e.target.value) ?? bed.cellCm })} />
            </label>
          </>
        )}
        <label className="pt-field"><span>{t("hab.bed.substrate")}</span>
          <select value={bed.substrate ?? "LightweightRoofSubstrate"} disabled={!canEdit} onChange={(e) => setBed({ substrate: e.target.value as SubstrateKind })}>
            {SUBSTRATE_KINDS.map((k) => <option key={k} value={k}>{t(`hab.sub.${k}`)}</option>)}
          </select>
        </label>
        <label className="pt-field"><span>{t("hab.bed.pipes")}</span>
          <input type="number" min={0} max={20} disabled={!canEdit} value={bed.tankPipes ?? 0} onChange={(e) => setBed({ tankPipes: num(e.target.value) ?? 0 })} />
        </label>
        <label className="pt-field"><span>{t("hab.bed.pipeMm")}</span>
          <select value={bed.tankPipeMm ?? 110} disabled={!canEdit || !(bed.tankPipes ?? 0)} onChange={(e) => setBed({ tankPipeMm: Number(e.target.value) })}>
            {[50, 75, 110, 125, 160].map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </label>
        {guided ? (
          <label className="pt-field"><span>{t("wb.box.people")}</span>
            <select value={people ?? ""} disabled={!canEdit} onChange={(e) => setBed({ wormBinCm: wormBoxCm(Number(e.target.value), bed.widthCm, bed.lengthCm) })}>
              {people === undefined && <option value="">{t("wb.box.asIs", { cm: bed.wormBinCm ?? 0 })}</option>}
              {boxOptions(bed.widthCm, bed.lengthCm).map(({ n, cm, max }) => <option key={n} value={n}>{t(max ? "wb.box.option.max" : n === 1 ? "wb.box.option.one" : "wb.box.option", { n, cm })}</option>)}
            </select>
          </label>
        ) : (
          <label className="pt-field"><span>{t("hab.bed.worm")}</span>
            <input type="number" min={0} step={10} disabled={!canEdit} value={bed.wormBinCm ?? 0} onChange={(e) => setBed({ wormBinCm: num(e.target.value) ?? 0 })} />
          </label>
        )}
        <label className="pt-field" title={t("hab.bed.mulch.hint")}><span>{t("hab.bed.mulch")}</span>
          <input type="number" min={0} max={15} disabled={!canEdit} value={bed.mulchCm ?? 0} onChange={(e) => setBed({ mulchCm: num(e.target.value) ?? 0 })} />
        </label>
      </div>
      <p className={`pt-bedload${onRoof ? ` pt-bedload--${loadClass(load.kgPerM2)}` : ""}`}>
        <strong>{t("hab.load", { kg: load.totalKg, m2: load.kgPerM2 })}</strong>
        {load.tankLitres > 0 && <> · {t("hab.load.tank", { l: load.tankLitres })}</>}
        {onRoof && <span className="pt-muted"> · {t(`hab.load.${loadClass(load.kgPerM2)}`)} {t("hab.load.check")}</span>}
      </p>
      {(bed.mulchCm ?? 0) > 3 && bed.guildId && <p className="pt-muted">{t("hab.bed.mulch.thick")}</p>}
      {guided && (bed.wormBinCm ?? 0) > 0 && (
        <p className="pt-muted">{t("wb.box.year", { cm: bed.wormBinCm ?? 0, kg: year.scrapsKg, castings: year.castingsKg, uses: year.bedUsesKg })}</p>
      )}
      <p className="pt-muted pt-bedbox__hint">{t("hab.bed.grid", { rows, cols })}</p>
      {canEdit && (
        <label className="pt-field pt-bedbox__brush"><span>{t("hab.brush")}</span>
          <CropSelect value={brush} onChange={setBrush} woody={false} />
        </label>
      )}
      <div className="pt-bed__scroll">
        <div className="pt-bed" style={{ gridTemplateColumns: `repeat(${cols}, 1.25rem)` }} role="grid" aria-label={bed.name}>
          {Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => {
            const here = at.get(`${r}|${c}`);
            const near = covered.get(`${r}|${c}`);
            const color = here ? cropColor(here.cropId) : near ? cropColor(near.cropId) : undefined;
            const name = here ? cropName(cropById(here.cropId)!, lang) : "";
            if (c >= binFrom && !here) {
              return <span key={`${r}|${c}`} role="gridcell" className="pt-bed__cell pt-bed__cell--bin" title={t("hab.bed.wormbox")} />;
            }
            return (
              <button key={`${r}|${c}`} type="button" role="gridcell"
                className={"pt-bed__cell" + (here ? ` pt-bed__cell--on pt-bed__cell--${here.status}` : near ? " pt-bed__cell--near" : "") + (here?.id === selected ? " pt-bed__cell--sel" : "")
                  + (here && crowded.has(here.id) ? " pt-bed__cell--crowded" : "")}
                style={color ? { background: color } : undefined}
                title={here ? `${name} · ${t(`hab.status.${here.status}`)}` : `${r + 1} / ${c + 1}`}
                aria-label={here ? name : `${r + 1} / ${c + 1}`}
                onClick={(e) => click(r, c, e.shiftKey)} />
            );
          }))}
        </div>
      </div>

      {refused && <p className="pt-error" role="status">{refused} {t("hab.cell.force")}</p>}
      {crowded.size > 0 && <p className="pt-muted">{t("hab.bed.crowded", { n: crowded.size })}</p>}
      {canEdit && <PlanFromSets beds={[bed]} habitat={habitat} edit={edit} canEdit={canEdit} />}

      {sel && crop && (
        <div className="pt-cellpanel">
          <strong>{cropName(crop, lang)}</strong> <span className="pt-muted">({crop.names.la}) · {t("hab.cell.at", { row: sel.row + 1, col: sel.col + 1 })}</span>
          <div className="pt-habitat__fields">
            <label className="pt-field"><span>{t("hab.cell.status")}</span>
              <select value={sel.status} disabled={!canEdit} onChange={(e) => setCell(sel.id, { status: e.target.value as CellStatus })}>
                {CELL_STATUSES.map((s) => <option key={s} value={s}>{t(`hab.status.${s}`)}</option>)}
              </select>
            </label>
            <label className="pt-field"><span>{t("hab.cell.sown")}</span>
              <input type="date" disabled={!canEdit} value={sel.sownOn ?? ""} onChange={(e) => setCell(sel.id, { sownOn: e.target.value || undefined })} />
            </label>
            <label className="pt-field"><span>{t("hab.cell.depth")}</span>
              <input type="number" min={0} max={150} disabled={!canEdit} placeholder={String(crop.needs.sowingDepthMm ?? "")}
                value={sel.depthMm ?? ""} onChange={(e) => setCell(sel.id, { depthMm: num(e.target.value) })} />
            </label>
            <label className="pt-field"><span>{t("hab.cell.seeds")}</span>
              <input type="number" min={1} max={20} disabled={!canEdit} placeholder={String(crop.needs.seedsPerPoint ?? "")}
                value={sel.seeds ?? ""} onChange={(e) => setCell(sel.id, { seeds: num(e.target.value) })} />
            </label>
          </div>
          {job && (
            <p className="pt-muted pt-cellpanel__job">
              {t("hab.cell.job", { x: job.xMm, y: job.yMm, depth: job.depthMm, seeds: job.seeds, spacing: job.spacingMm })}
              {job.checkAfterDays !== null && ` · ${t("hab.cell.check", { days: job.checkAfterDays })}`}
            </p>
          )}
          {canEdit && (
            <button className="pt-button pt-button--ghost" onClick={() => { edit((h) => ({ ...h, cells: h.cells.filter((c) => c.id !== sel.id) })); setSelected(null); }}>
              {t("hab.remove.cell")}
            </button>
          )}
        </div>
      )}
      {canEdit && !bed.guildId && !bed.farmId && zone && (
        <button className="pt-button pt-button--ghost" title={t("hab.make.guild.hint")} onClick={() => edit((h) => {
          const made = guildForBed(bed, zone, t("hab.guild.default", { area: zone.name }), h.cells);
          return { ...h, guilds: [...(h.guilds ?? []), made.guild], beds: h.beds.map((b) => (b.id === bed.id ? made.bed : b)) };
        })}>
          {t("hab.make.guild")}
        </button>
      )}
      {canEdit && cells.length > 0 && (
        <ConfirmButton label={t("hab.clear.bed")} says={t("hab.clear.bed.says", { n: cells.length })}
          onConfirm={() => { setSelected(null); edit((h) => ({ ...h, cells: h.cells.filter((c) => c.bedId !== bed.id) })); }} />
      )}
      {canEdit && cells.length === 0 && !bed.guildId && !bed.farmId && (
        <button className="pt-button pt-button--ghost" onClick={() => edit((h) => ({ ...h, beds: h.beds.filter((b) => b.id !== bed.id) }))}>
          {t("hab.remove.bed")}
        </button>
      )}
    </div>
  );
}

/** Fruit trees and other long-lived plants: a sketch of the zone and their details. */
function GardenPlants({ zone, plants, edit, canEdit }: { zone: Zone; plants: GardenPlant[]; edit: Edit; canEdit: boolean }) {
  const { t, lang } = useT();
  const set = (id: string, patch: Partial<GardenPlant>) =>
    edit((h) => ({ ...h, plants: h.plants.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  const side = Math.max(4, Math.sqrt(zone.areaM2 ?? 16), ...plants.map((p) => Math.max(p.xM ?? 0, p.yM ?? 0) + 1));
  return (
    <div className="pt-plants">
      <svg className="pt-plants__sketch" viewBox={`-0.5 -0.5 ${side + 1} ${side + 1}`} role="img" aria-label={t("hab.sketch", { zone: zone.name })}>
        <rect x={0} y={0} width={side} height={side} className="pt-plants__ground" />
        {plants.filter((p) => p.xM !== undefined && p.yM !== undefined).map((p) => (
          <g key={p.id}>
            <circle cx={p.xM} cy={p.yM} r={Math.max(0.35, side / 30)} fill={cropColor(p.cropId)} />
            <text x={p.xM! + side / 25} y={p.yM! + side / 80} className="pt-plants__label" fontSize={side / 22}>{p.name}</text>
          </g>
        ))}
      </svg>
      <table className="pt-table">
        <thead>
          <tr><th>{t("hab.name")}</th><th>{t("hab.crop")}</th><th>{t("hab.plant.year")}</th><th>{t("hab.plant.rootstock")}</th><th>x m</th><th>y m</th><th /></tr>
        </thead>
        <tbody>
          {plants.map((p) => (
            <tr key={p.id}>
              <td>{canEdit ? <input className="pt-input" value={p.name} onChange={(e) => set(p.id, { name: e.target.value })} aria-label={t("hab.name")} /> : p.name}</td>
              <td>{canEdit ? <CropSelect value={p.cropId} woody onChange={(c) => set(p.id, { cropId: c })} /> : cropName(cropById(p.cropId)!, lang)}</td>
              <td><input className="pt-input pt-input--num" type="number" disabled={!canEdit} value={p.plantedYear ?? ""} onChange={(e) => set(p.id, { plantedYear: num(e.target.value) })} aria-label={t("hab.plant.year")} /></td>
              <td><input className="pt-input" disabled={!canEdit} value={p.rootstock ?? ""} onChange={(e) => set(p.id, { rootstock: e.target.value || undefined })} aria-label={t("hab.plant.rootstock")} /></td>
              <td><input className="pt-input pt-input--num" type="number" min={0} step={0.5} disabled={!canEdit} value={p.xM ?? ""} onChange={(e) => set(p.id, { xM: num(e.target.value) })} aria-label="x" /></td>
              <td><input className="pt-input pt-input--num" type="number" min={0} step={0.5} disabled={!canEdit} value={p.yM ?? ""} onChange={(e) => set(p.id, { yM: num(e.target.value) })} aria-label="y" /></td>
              <td>{canEdit && <button className="pt-button pt-button--ghost" onClick={() => edit((h) => ({ ...h, plants: h.plants.filter((x) => x.id !== p.id) }))} aria-label={t("hab.remove.plant")}>×</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
