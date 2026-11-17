import * as React from "react";
import type { HeadFC } from "gatsby";
import {
  WORMBED5_SIZES, cropById, cropName, emptyHabitat, layerOf, minDepthCm, planFromSets, plantSets, setName, setText,
} from "@dlab5/permtek5-core";
import type { Bed, LibraryCrop, PlantSet } from "@dlab5/permtek5-core";
import { Shell } from "../components/Shell";
import { Preview } from "../components/habitat/HabitatRecipes";
import { cropColor } from "../components/habitat/common";
import { useT } from "../lib/i18n";

/**
 * The library's plant sets, explained (docs/adr/0028): why each set's crops go together, what each needs, and the
 * layout the planner makes from it on a WormBed5. The Map links each set here.
 */
const SetsPage: React.FC = () => {
  const { t } = useT();
  return (
    <Shell active="sets" title={t("sets.title")}>
      <div className="pt-pagehead"><h1>{t("sets.title")}</h1></div>
      <section className="pt-panel" id="how">
        <h2 className="pt-panel__title">{t("sets.how")}</h2>
        <ol className="pt-sets__steps">{[1, 2, 3, 4, 5].map((n) => <li key={n}>{t(`sets.how.${n}`)}</li>)}</ol>
        <p className="pt-panel__hint">{t("sets.how.layers")}</p>
        <p className="pt-panel__hint">{t("sets.how.caveat")}</p>
      </section>
      <nav className="pt-sets__index" aria-label={t("sets.title")}>
        {plantSets().map((s) => <SetLink key={s.id} set={s} />)}
      </nav>
      {plantSets().map((s) => <SetSection key={s.id} set={s} />)}
    </Shell>
  );
};

function SetLink({ set }: { set: PlantSet }) {
  const { lang } = useT();
  return <a className="pt-chip" href={`#${set.id}`}>{setName(set, lang)}</a>;
}

function SetSection({ set }: { set: PlantSet }) {
  const { t, lang } = useT();
  const crops = set.members.map((m) => ({ ...m, crop: cropById(m.cropId)! })).filter((m) => m.crop);
  const total = crops.reduce((n, m) => n + m.share, 0);
  const name = (c: LibraryCrop) => cropName(c, lang);
  // the example bed is deep enough for every member, so each gets its room
  const depth = Math.max(WORMBED5_SIZES.depthsCm[0], ...crops.map((m) => minDepthCm(m.cropId) ?? 0));
  const bed: Bed = { id: "example", name: "", zoneId: "", lengthCm: 300, widthCm: 100, depthCm: depth, cellCm: WORMBED5_SIZES.cellCm, wormBinCm: 40 };
  const plan = React.useMemo(() => planFromSets(bed, [{ setId: set.id, share: 1 }], [], { seed: 5 }), [set.id]);
  const pairs = (kind: "good" | "bad") => {
    const out: string[] = [];
    crops.forEach((a, i) => crops.slice(i + 1).forEach((b) => {
      if (a.crop.mix?.[kind].includes(b.cropId) || b.crop.mix?.[kind].includes(a.cropId)) out.push(`${name(a.crop)} + ${name(b.crop)}`);
    }));
    return out;
  };
  const relatives = crops.flatMap((a, i) => crops.slice(i + 1)
    .filter((b) => a.crop.mix && a.crop.mix.family === b.crop.mix?.family)
    .map((b) => `${name(a.crop)} + ${name(b.crop)} (${a.crop.mix!.family})`));
  const good = pairs("good"), bad = pairs("bad");

  return (
    <section className="pt-panel pt-sets__set" id={set.id}>
      <h2 className="pt-panel__title">{setName(set, lang)}</h2>
      <p className="pt-sets__about">{setText(set.about, lang)}</p>
      <h3>{t("sets.why")}</h3>
      <p>{setText(set.why, lang)}</p>

      <h3>{t("sets.members")}</h3>
      <div className="pt-table__scroll">
        <table className="pt-table">
          <thead>
            <tr><th>{t("sets.crop")}</th><th>{t("sets.room")}</th><th>{t("sets.layer")}</th><th>{t("sets.spacing")}</th><th>{t("sets.height")}</th><th>{t("sets.depth")}</th></tr>
          </thead>
          <tbody>
            {crops.map((m) => (
              <tr key={m.cropId}>
                <td><span className="pt-recipe__dot" style={{ background: cropColor(m.cropId) }} />{name(m.crop)} <span className="pt-muted">({m.crop.names.la})</span></td>
                <td>{Math.round((m.share / total) * 100)} %</td>
                <td>{t(`sets.layer.${layerOf(m.cropId)}`)}</td>
                <td>{m.crop.needs.spacingCm ?? "—"} cm</td>
                <td>{m.crop.mix?.heightCm ?? "—"} cm</td>
                <td>{minDepthCm(m.cropId) ?? "—"} cm</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3>{t("sets.neighbours")}</h3>
      <ul className="pt-sets__pairs">
        <li><strong>{t("sets.good")}</strong> {good.join(" · ") || "—"}</li>
        <li><strong>{t("sets.bad")}</strong> {bad.join(" · ") || "—"}</li>
        <li><strong>{t("sets.relatives")}</strong> {relatives.join(" · ") || "—"}</li>
      </ul>

      <h3>{t("sets.layout")}</h3>
      <p className="pt-panel__hint">{t("sets.layout.bed", { l: bed.lengthCm, w: bed.widthCm, d: depth, box: bed.wormBinCm ?? 0 })}</p>
      <Preview bed={bed} suggestion={plan} habitat={emptyHabitat()} />
      <p className="pt-recipes__legend">
        {plan.crops.filter((c) => c.placed > 0).map((c) => (
          <span key={c.cropId}><span className="pt-recipe__dot" style={{ background: cropColor(c.cropId) }} />{c.placed} × {name(cropById(c.cropId)!)}</span>
        ))}
      </p>
      <p className="pt-panel__hint">
        {t("rec.plant.result", { good: plan.goodPairs, bad: plan.badPairs, same: plan.sameCropPairs, cover: Math.round(plan.cover * 100) })}
      </p>
      <p className="pt-panel__hint"><a href="#how">{t("sets.layout.how")}</a></p>
    </section>
  );
}

export default SetsPage;
export const Head: HeadFC = () => <title>Plant sets · permtek5.dlab5</title>;
