import * as React from "react";
import { checkHabitat, habitatFromTtl, habitatToTtl } from "@dlab5/permtek5-core";
import type { Habitat } from "@dlab5/permtek5-core";
import { useT } from "../../lib/i18n";

/** The habitat's A-Box as a Turtle file: download it, or load one (it replaces the draft; nothing is saved until you save). */
export function HabitatTransfer({ habitat, canEdit, replace, mode }: {
  habitat: Habitat; canEdit: boolean; replace: (h: Habitat) => void; mode: "import" | "export";
}) {
  const { t } = useT();
  const [msg, setMsg] = React.useState<string | null>(null);
  const download = async () => {
    const blob = new Blob([await habitatToTtl(habitat)], { type: "text/turtle" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "habitat.ttl";
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const load = async (file: File) => {
    try {
      const h = habitatFromTtl(await file.text());
      const problems = checkHabitat(h);
      if (problems.length) { setMsg(problems.map((p) => t(`hab.problem.${p.code}`)).join("; ")); return; }
      replace(h);
      setMsg(t("io.loaded", { zones: h.zones.length, cells: h.cells.length, plants: h.plants.length }));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <div className="pt-panel">
      {mode === "export" ? (
        <>
          <p className="pt-panel__hint">{t("io.export.hint")}</p>
          <div><button className="pt-button" onClick={download}>{t("io.export")}</button></div>
        </>
      ) : (
        <>
          <p className="pt-panel__hint">{t("io.import.hint")}</p>
          {canEdit
            ? <input type="file" accept=".ttl,text/turtle" onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} />
            : <p className="pt-muted">{t("hab.readonly")}</p>}
        </>
      )}
      {msg && <p className="pt-muted" role="status">{msg}</p>}
    </div>
  );
}
