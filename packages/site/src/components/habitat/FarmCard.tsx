import * as React from "react";
import { farmLayout } from "@dlab5/permtek5-core";
import type { BedFarm, ClimateMonth, Habitat } from "@dlab5/permtek5-core";
import { useT } from "../../lib/i18n";
import { ConfirmButton, cropColor } from "./common";
import { BedEditor, GuildCard } from "./HabitatMap";
import { PlanFromSets } from "./PlantSets";

type Edit = (f: (h: Habitat) => Habitat) => void;

/**
 * A farm of beds (docs/adr/0027, 0028): its plan (click a bed to open it), planning it from plant sets, removing it.
 * A farm of WormBed5 has a guild per bed; the bed opens as its guild, with its worm box and water.
 */
export function FarmCard({ farm, habitat, edit, canEdit, months = null }: {
  farm: BedFarm; habitat: Habitat; edit: Edit; canEdit: boolean; months?: ClimateMonth[] | null;
}) {
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
  const guild = bed?.guildId ? (habitat.guilds ?? []).find((g) => g.id === bed.guildId) : undefined;
  const guilds = new Set(beds.map((b) => b.guildId).filter(Boolean));
  return (
    <div className="pt-guild">
      <div className="pt-habitat__zonehead">
        {canEdit
          ? <input className="pt-input pt-habitat__name" value={farm.name} onChange={(e) => set({ name: e.target.value })} aria-label={t("hab.name")} />
          : <strong>{farm.name}</strong>}
        <span className="pt-badge">{t(guilds.size ? "farm.badge.wb" : "farm.badge")}</span>
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
      {guild && <GuildCard guild={guild} habitat={habitat} edit={edit} canEdit={canEdit} months={months} inFarm />}
      {bed && !guild && <BedEditor bed={bed} habitat={habitat} edit={edit} canEdit={canEdit} months={months} />}
      {canEdit && <PlanFromSets beds={beds} habitat={habitat} edit={edit} canEdit={canEdit} />}
      {canEdit && (
        <p className="pt-habitat__actions">
          <ConfirmButton label={t("farm.remove")} says={t("farm.remove.says", { beds: beds.length, cells: cells.length })}
            onConfirm={() => edit((x) => ({
              ...x, farms: (x.farms ?? []).filter((f) => f.id !== farm.id), beds: x.beds.filter((b) => !ids.has(b.id)),
              cells: x.cells.filter((c) => !ids.has(c.bedId)), periods: (x.periods ?? []).filter((p) => !ids.has(p.bedId)),
              // a WormBed5 farm's guilds go with their beds, and their water and learning
              guilds: (x.guilds ?? []).filter((g) => !guilds.has(g.id)),
              catchments: (x.catchments ?? []).filter((c) => !guilds.has(c.guildId)), stores: (x.stores ?? []).filter((c) => !guilds.has(c.guildId)),
              valves: (x.valves ?? []).filter((c) => !guilds.has(c.guildId)), cycles: (x.cycles ?? []).filter((c) => !guilds.has(c.aboutId)),
            }))} />
        </p>
      )}
    </div>
  );
}
