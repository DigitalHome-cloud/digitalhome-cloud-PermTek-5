import * as React from "react";
import { SURFACE_LIMITS, farmLayout, newFarm } from "@dlab5/permtek5-core";
import type { BedFarm, Habitat, Zone } from "@dlab5/permtek5-core";
import { useT } from "../../lib/i18n";
import { ConfirmButton, cropColor, num } from "./common";
import { BedEditor } from "./HabitatMap";
import { PlanFromSets } from "./PlantSets";

type Edit = (f: (h: Habitat) => Habitat) => void;
const L = SURFACE_LIMITS.BedFarmSurface;

/** A new farm of beds (docs/adr/0027): rows × beds per row, one bed size, paths between. */
export function NewFarm({ zone, edit, onDone }: { zone: Zone; edit: Edit; onDone: () => void }) {
  const { t } = useT();
  const [f, setF] = React.useState({ rows: 2, perRow: 3, lengthCm: 500, widthCm: 120, cellCm: 10, pathCm: 50 });
  const field = (key: keyof typeof f, min: number, max: number, step = 1) => (
    <label className="pt-field"><span>{t(`farm.${key}`)}</span>
      <input type="number" min={min} max={max} step={step} value={f[key]} onChange={(e) => setF({ ...f, [key]: num(e.target.value) ?? f[key] })} />
    </label>
  );
  const ok = f.rows * f.perRow <= L.maxBeds && f.pathCm >= L.minPathCm && f.pathCm <= L.maxPathCm;
  return (
    <div className="pt-bedbox">
      <strong>{t("farm.new")}</strong>
      <div className="pt-habitat__fields">
        {field("rows", 1, L.maxRows)}{field("perRow", 1, L.maxPerRow)}{field("pathCm", L.minPathCm, L.maxPathCm, 10)}
        {field("lengthCm", 10, 3000, 10)}{field("widthCm", 10, 1000, 10)}{field("cellCm", 5, 100, 5)}
      </div>
      <p className="pt-muted">{t("farm.new.says", { n: f.rows * f.perRow, max: L.maxBeds })}</p>
      <p className="pt-habitat__actions">
        <button className="pt-button" disabled={!ok} onClick={() => {
          edit((h) => {
            const made = newFarm(zone, t("farm.default", { n: (h.farms ?? []).length + 1 }), f.rows, f.perRow,
              { lengthCm: f.lengthCm, widthCm: f.widthCm, cellCm: f.cellCm, pathCm: f.pathCm });
            return { ...h, farms: [...(h.farms ?? []), made.farm], beds: [...h.beds, ...made.beds] };
          });
          onDone();
        }}>{t("farm.make")}</button>
        <button className="pt-button pt-button--ghost" onClick={onDone}>{t("hab.confirm.no")}</button>
      </p>
    </div>
  );
}

/** A farm of beds: its plan (click a bed to open it), planning it from plant sets, removing it. */
export function FarmCard({ farm, habitat, edit, canEdit }: { farm: BedFarm; habitat: Habitat; edit: Edit; canEdit: boolean }) {
  const { t } = useT();
  const beds = habitat.beds.filter((b) => b.farmId === farm.id);
  const [open, setOpen] = React.useState<string | null>(null);
  const at = farmLayout(farm, beds);
  const w = farm.perRow * farm.lengthCm + (farm.perRow - 1) * farm.pathCm;
  const h = farm.rows * farm.widthCm + (farm.rows - 1) * farm.pathCm;
  const ids = new Set(beds.map((b) => b.id));
  const cells = habitat.cells.filter((c) => ids.has(c.bedId));
  const set = (patch: Partial<BedFarm>) => edit((x) => ({ ...x, farms: (x.farms ?? []).map((f) => (f.id === farm.id ? { ...f, ...patch } : f)) }));
  const bed = beds.find((b) => b.id === open);
  return (
    <div className="pt-guild">
      <div className="pt-habitat__zonehead">
        {canEdit
          ? <input className="pt-input pt-habitat__name" value={farm.name} onChange={(e) => set({ name: e.target.value })} aria-label={t("hab.name")} />
          : <strong>{farm.name}</strong>}
        <span className="pt-badge">{t("farm.badge")}</span>
        <span className="pt-muted">{t("farm.size", { rows: farm.rows, perRow: farm.perRow, l: farm.lengthCm, w: farm.widthCm, path: farm.pathCm })}</span>
      </div>
      <svg className="pt-farm" viewBox={`-10 -10 ${w + 20} ${h + 20}`} role="group" aria-label={farm.name}>
        {at.map(({ bedId, xCm, yCm }) => {
          const b = beds.find((x) => x.id === bedId)!;
          const mine = cells.filter((c) => c.bedId === bedId);
          return (
            <g key={bedId} className={"pt-farm__bed" + (open === bedId ? " pt-farm__bed--open" : "")} role="button" tabIndex={0}
              aria-label={`${b.name}: ${t("farm.planted", { n: mine.length })}`} aria-pressed={open === bedId}
              onClick={() => setOpen(open === bedId ? null : bedId)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setOpen(open === bedId ? null : bedId); }}>
              <rect x={xCm} y={yCm} width={farm.lengthCm} height={farm.widthCm} rx={4} />
              {mine.map((c) => (
                <circle key={c.id} cx={xCm + (c.col + 0.5) * b.cellCm} cy={yCm + (c.row + 0.5) * b.cellCm} r={b.cellCm * 0.45} fill={cropColor(c.cropId)} />
              ))}
              <text x={xCm + 8} y={yCm + 22} className="pt-farm__label">{b.name}</text>
            </g>
          );
        })}
      </svg>
      <p className="pt-muted">{t("farm.hint")}</p>
      {bed && <BedEditor bed={bed} habitat={habitat} edit={edit} canEdit={canEdit} />}
      {canEdit && <PlanFromSets beds={beds} habitat={habitat} edit={edit} canEdit={canEdit} />}
      {canEdit && (
        <p className="pt-habitat__actions">
          <ConfirmButton label={t("farm.remove")} says={t("farm.remove.says", { beds: beds.length, cells: cells.length })}
            onConfirm={() => edit((x) => ({
              ...x, farms: (x.farms ?? []).filter((f) => f.id !== farm.id), beds: x.beds.filter((b) => !ids.has(b.id)),
              cells: x.cells.filter((c) => !ids.has(c.bedId)),
            }))} />
        </p>
      )}
    </div>
  );
}
