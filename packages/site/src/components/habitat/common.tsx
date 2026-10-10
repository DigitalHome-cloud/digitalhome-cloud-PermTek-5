import * as React from "react";
import { cropName, crops } from "@dlab5/permtek5-core";
import type { LibraryCrop, Problem } from "@dlab5/permtek5-core";
import type { SaveResult } from "../../lib/useHabitat";
import { useT } from "../../lib/i18n";

/** A stable colour per crop, the same in both themes (it is drawn on the accent-free grid). */
export function cropColor(cropId: string): string {
  let h = 0;
  for (const ch of cropId) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `hsl(${h} 45% 52%)`;
}

export function CropSelect({ value, onChange, woody, id }: {
  value: string; onChange: (id: string) => void; woody: boolean; id?: string;
}) {
  const { t, lang } = useT();
  const list = crops()
    .filter((c: LibraryCrop) => (c.growthForm === "Tree" || c.growthForm === "Shrub") === woody)
    .sort((a, b) => cropName(a, lang).localeCompare(cropName(b, lang), lang));
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{t("hab.crop.choose")}</option>
      {list.map((c) => <option key={c.id} value={c.id}>{cropName(c, lang)} ({c.names.la})</option>)}
    </select>
  );
}

/** Unsaved changes: save or discard; and what a refused save said. */
export function SaveBar({ dirty, saving, onSave, onDiscard }: {
  dirty: boolean; saving: boolean; onSave: () => Promise<SaveResult>; onDiscard: () => void;
}) {
  const { t } = useT();
  const [msg, setMsg] = React.useState<string[] | null>(null);
  if (!dirty && !msg) return null;
  const save = async () => {
    const r = await onSave();
    if (r.ok) setMsg(null);
    else if (r.kind === "conflict") setMsg([t("hab.save.conflict")]);
    else if (r.kind === "invalid") setMsg(r.messages);
    else setMsg(r.problems.map((p: Problem) => t(`hab.problem.${p.code}`)));
  };
  return (
    <div className="pt-savebar" role="status">
      {dirty && <span>{t("hab.save.dirty")}</span>}
      {dirty && <button className="pt-button" onClick={save} disabled={saving}>{t("hab.save")}</button>}
      {dirty && <button className="pt-button pt-button--ghost" onClick={() => { setMsg(null); onDiscard(); }}>{t("hab.discard")}</button>}
      {msg && <ul className="pt-error">{[...new Set(msg)].map((m) => <li key={m}>{m}</li>)}</ul>}
    </div>
  );
}

export const num = (s: string): number | undefined => (s.trim() === "" || Number.isNaN(Number(s)) ? undefined : Number(s));
