import * as React from "react";
import {
  CITYDEMO_TTL, EXPOSURES, ZONE_KINDS, bedGrid, cropById, cropName, defaultOffset, footprint, habitatFromTtl, newId, sowingJob,
} from "@dlab5/permtek5-core";
import type { Bed, Cell, CellStatus, Exposure, GardenPlant, Habitat, Zone, ZoneKind } from "@dlab5/permtek5-core";
import { CELL_STATUSES } from "@dlab5/permtek5-core";
import { useT } from "../../lib/i18n";
import { CropSelect, cropColor, num } from "./common";

type Edit = (f: (h: Habitat) => Habitat) => void;


/** The habitat's zones, with each zone's beds and garden plants. */
export function HabitatMap({ habitat, edit, canEdit, replace }: {
  habitat: Habitat; edit: Edit; canEdit: boolean; replace: (h: Habitat) => void;
}) {
  const { t } = useT();
  const addZone = (kind: ZoneKind) => edit((h) => ({
    ...h, zones: [...h.zones, { id: newId("zone"), name: t(`hab.kind.${kind}`), kind, exposure: [], offsetC: defaultOffset(kind) }],
  }));
  return (
    <div className="pt-habitat">
      {habitat.zones.length === 0 && (
        <div className="pt-empty">
          <p>{t("hab.empty")}</p>
          {canEdit && (
            <p className="pt-habitat__actions">
              <button className="pt-button" onClick={() => addZone("RoofZone")}>{t("hab.add.roof")}</button>
              <button className="pt-button" onClick={() => addZone("GroundZone")}>{t("hab.add.garden")}</button>
              <button className="pt-button pt-button--ghost" onClick={() => replace({ ...habitatFromTtl(CITYDEMO_TTL), rest: habitat.rest })}>
                {t("hab.example")}
              </button>
            </p>
          )}
        </div>
      )}
      {habitat.zones.map((z) => <ZoneCard key={z.id} zone={z} habitat={habitat} edit={edit} canEdit={canEdit} />)}
      {canEdit && habitat.zones.length > 0 && (
        <p className="pt-habitat__actions">
          {ZONE_KINDS.map((k) => (
            <button key={k} className="pt-button pt-button--ghost" onClick={() => addZone(k)}>+ {t(`hab.kind.${k}`)}</button>
          ))}
        </p>
      )}
    </div>
  );
}

function ZoneCard({ zone, habitat, edit, canEdit }: { zone: Zone; habitat: Habitat; edit: Edit; canEdit: boolean }) {
  const { t } = useT();
  const set = (patch: Partial<Zone>) => edit((h) => ({ ...h, zones: h.zones.map((z) => (z.id === zone.id ? { ...z, ...patch } : z)) }));
  const beds = habitat.beds.filter((b) => b.zoneId === zone.id);
  const plants = habitat.plants.filter((p) => p.zoneId === zone.id);
  const empty = !beds.length && !plants.length;
  const toggle = (e: Exposure) => set({ exposure: zone.exposure.includes(e) ? zone.exposure.filter((x) => x !== e) : [...zone.exposure, e].sort() });
  const addBed = () => edit((h) => ({
    ...h, beds: [...h.beds, { id: newId("bed"), name: t("hab.bed.default"), zoneId: zone.id, lengthCm: 300, widthCm: 100, depthCm: 25, cellCm: 10 }],
  }));
  const addPlant = () => edit((h) => ({
    ...h, plants: [...h.plants, { id: newId("plant"), name: t("hab.plant.default"), zoneId: zone.id, cropId: "crop-pear" }],
  }));

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
            {ZONE_KINDS.map((k) => <option key={k} value={k}>{t(`hab.kind.${k}`)}</option>)}
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

      {beds.map((b) => <BedEditor key={b.id} bed={b} habitat={habitat} edit={edit} canEdit={canEdit} />)}
      {plants.length > 0 && <GardenPlants zone={zone} plants={plants} edit={edit} canEdit={canEdit} />}

      {canEdit && (
        <p className="pt-habitat__actions">
          <button className="pt-button pt-button--ghost" onClick={addBed}>+ {t("hab.add.bed")}</button>
          <button className="pt-button pt-button--ghost" onClick={addPlant}>+ {t("hab.add.plant")}</button>
          {empty && (
            <button className="pt-button pt-button--ghost" onClick={() => edit((h) => ({ ...h, zones: h.zones.filter((z) => z.id !== zone.id) }))}>
              {t("hab.remove.zone")}
            </button>
          )}
        </p>
      )}
    </section>
  );
}

/** A bed as its grid of cells. Choose a crop, then click empty cells to plant it; click a planted cell to edit it. */
function BedEditor({ bed, habitat, edit, canEdit }: { bed: Bed; habitat: Habitat; edit: Edit; canEdit: boolean }) {
  const { t, lang } = useT();
  const [brush, setBrush] = React.useState("");
  const [selected, setSelected] = React.useState<string | null>(null);
  const { rows, cols } = bedGrid(bed);
  const cells = habitat.cells.filter((c) => c.bedId === bed.id);
  const at = new Map(cells.map((c) => [`${c.row}|${c.col}`, c]));
  // cells covered by a planted cell's spacing (shown lighter)
  const covered = new Map<string, Cell>();
  for (const c of cells) {
    const f = footprint(c.cropId, bed);
    const r0 = c.row - Math.floor((f - 1) / 2), c0 = c.col - Math.floor((f - 1) / 2);
    for (let r = r0; r < r0 + f; r++) for (let k = c0; k < c0 + f; k++) if (!at.has(`${r}|${k}`)) covered.set(`${r}|${k}`, c);
  }
  const setBed = (patch: Partial<Bed>) => edit((h) => ({ ...h, beds: h.beds.map((b) => (b.id === bed.id ? { ...b, ...patch } : b)) }));
  const setCell = (id: string, patch: Partial<Cell>) => edit((h) => ({ ...h, cells: h.cells.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  const click = (row: number, col: number) => {
    const here = at.get(`${row}|${col}`);
    if (here) { setSelected(here.id); return; }
    if (!canEdit || !brush) return;
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
      </div>
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
            return (
              <button key={`${r}|${c}`} type="button" role="gridcell"
                className={"pt-bed__cell" + (here ? ` pt-bed__cell--on pt-bed__cell--${here.status}` : near ? " pt-bed__cell--near" : "") + (here?.id === selected ? " pt-bed__cell--sel" : "")}
                style={color ? { background: color } : undefined}
                title={here ? `${name} · ${t(`hab.status.${here.status}`)}` : `${r + 1} / ${c + 1}`}
                aria-label={here ? name : `${r + 1} / ${c + 1}`}
                onClick={() => click(r, c)} />
            );
          }))}
        </div>
      </div>

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
      {canEdit && cells.length === 0 && (
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
