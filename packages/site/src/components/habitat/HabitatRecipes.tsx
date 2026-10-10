import * as React from "react";
import {
  bedGrid, cropById, cropName, crops, cropsWanted, footprint, newId, parseIngredients, plantCounts, recipeName, scorePlanting, sharedRecipes,
  suggestPlanting, wormBinCols,
} from "@dlab5/permtek5-core";
import type { Bed, Habitat, PlantingSuggestion, Recipe, RecipeLine } from "@dlab5/permtek5-core";
import { useT } from "../../lib/i18n";
import { CropSelect, cropColor } from "./common";

type Edit = (f: (h: Habitat) => Habitat) => void;
/** Crops that are grown for their neighbours, not for a recipe: offered with every planting. */
const HELPERS = ["crop-bush-bean", "crop-marigold"];

/**
 * Recipes drive what is planted (docs/adr/0021). The household keeps its own
 * recipes in its space's graph, takes shared ones over, and asks for a mixed
 * planting of the crops they need. A suggestion: nothing is planted until it
 * is accepted, and nothing is saved until Save.
 */
export function HabitatRecipes({ habitat, edit, canEdit }: { habitat: Habitat; edit: Edit; canEdit: boolean }) {
  const { t, lang } = useT();
  const own = habitat.recipes ?? [];
  const setRecipes = (f: (r: Recipe[]) => Recipe[]) => edit((h) => {
    const next = f(h.recipes ?? []);
    const { recipes: _drop, ...rest } = h;
    return next.length ? { ...rest, recipes: next } : rest;
  });
  const taken = new Set(own.map((r) => recipeName(r, lang)));

  return (
    <div className="pt-recipes">
      <p className="pt-muted">{t("rec.intro")}</p>

      <section className="pt-panel">
        <h2>{t("rec.ours")}</h2>
        {own.length === 0 && <p className="pt-muted">{t("rec.ours.none")}</p>}
        {own.map((r) => (
          <RecipeCard key={r.id} recipe={r}
            action={canEdit ? { label: t("rec.remove"), run: () => setRecipes((all) => all.filter((x) => x.id !== r.id)) } : undefined} />
        ))}
      </section>

      {own.length > 0 && habitat.beds.length > 0 && <PlantFor habitat={habitat} recipes={own} edit={edit} canEdit={canEdit} />}
      {canEdit && <NewRecipe onSave={(r) => setRecipes((all) => [...all, r])} />}

      <section className="pt-panel">
        <h2>{t("rec.shared")}</h2>
        <p className="pt-muted">{t("rec.shared.hint")}</p>
        {sharedRecipes().map((r) => (
          <RecipeCard key={r.id} recipe={r} folded
            action={canEdit && !taken.has(recipeName(r, lang))
              ? { label: t("rec.take"), run: () => setRecipes((all) => [...all, { ...r, id: newId("recipe") }]) } : undefined} />
        ))}
      </section>
    </div>
  );
}

function RecipeCard({ recipe, action, folded }: { recipe: Recipe; action?: { label: string; run: () => void }; folded?: boolean }) {
  const { t, lang } = useT();
  const grown = recipe.lines.filter((l) => l.cropId), bought = recipe.lines.filter((l) => !l.cropId);
  return (
    <details className="pt-recipe" open={!folded}>
      <summary>
        <strong>{recipeName(recipe, lang)}</strong>
        {recipe.yield && <span className="pt-muted"> · {recipe.yield}</span>}
        <span className="pt-muted"> · {t("rec.fromBed", { n: grown.length, of: recipe.lines.length })}</span>
      </summary>
      {recipe.description && <p className="pt-muted">{recipe.description}</p>}
      <ul className="pt-recipe__lines">
        {grown.map((l) => (
          <li key={l.text}>
            <span className="pt-recipe__dot" style={{ background: cropColor(l.cropId!) }} />
            {l.text} <span className="pt-muted">→ {cropById(l.cropId!) ? cropName(cropById(l.cropId!)!, lang) : l.cropId}
              {l.methods?.length && !l.methods.includes("Fresh") ? ` (${l.methods.map((m) => t(`rec.method.${m}`)).join(", ")})` : ""}</span>
          </li>
        ))}
        {bought.map((l) => <li key={l.text} className="pt-muted">{l.text} · {t("rec.bought")}</li>)}
      </ul>
      {recipe.steps && recipe.steps.length > 0 && <ol className="pt-recipe__steps">{recipe.steps.map((s) => <li key={s}>{s}</li>)}</ol>}
      {action && <button className="pt-button pt-button--ghost" onClick={action.run}>{action.label}</button>}
    </details>
  );
}

/** Paste a list of ingredients: each line is matched to a crop where one is named, for you to check. */
function NewRecipe({ onSave }: { onSave: (r: Recipe) => void }) {
  const { t, lang } = useT();
  const [name, setName] = React.useState("");
  const [text, setText] = React.useState("");
  const [fixes, setFixes] = React.useState<Record<string, string>>({});
  const lines: RecipeLine[] = parseIngredients(text).map((l) => {
    if (!(l.text in fixes)) return l;
    const crop = cropById(fixes[l.text]);
    return crop ? { text: l.text, cropId: crop.id, part: crop.parts[0], methods: l.methods ?? ["Fresh"] } : { text: l.text };
  });
  const save = () => {
    onSave({ id: newId("recipe"), names: { [lang === "de" || lang === "fr" ? lang : "en"]: name.trim() }, lines });
    setName(""); setText(""); setFixes({});
  };
  return (
    <section className="pt-panel">
      <h2>{t("rec.new")}</h2>
      <label className="pt-field"><span>{t("rec.new.name")}</span>
        <input className="pt-input" value={name} onChange={(e) => setName(e.target.value)} /></label>
      <label className="pt-field"><span>{t("rec.new.paste")}</span>
        <textarea className="pt-input pt-recipes__paste" rows={6} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("rec.new.placeholder")} /></label>
      {lines.length > 0 && (
        <>
          <p className="pt-muted">{t("rec.new.check")}</p>
          <ul className="pt-recipe__lines pt-recipe__lines--edit">
            {lines.map((l) => (
              <li key={l.text}>
                <span>{l.text}</span>
                <CropSelect value={l.cropId ?? ""} woody={false} onChange={(id) => setFixes((f) => ({ ...f, [l.text]: id }))} />
              </li>
            ))}
          </ul>
        </>
      )}
      <button className="pt-button" disabled={!name.trim() || lines.length === 0} onClick={save}>{t("rec.new.add")}</button>
    </section>
  );
}

/** The crops the recipes ask for, as a mixed planting of one bed's free cells. */
function PlantFor({ habitat, recipes, edit, canEdit }: { habitat: Habitat; recipes: Recipe[]; edit: Edit; canEdit: boolean }) {
  const { t, lang } = useT();
  const [bedId, setBedId] = React.useState(habitat.beds[0].id);
  const [helpers, setHelpers] = React.useState(true);
  const [seed, setSeed] = React.useState(5);
  const [tallSide, setTallSide] = React.useState<"first" | "last">("first");
  const [shown, setShown] = React.useState(true);
  const [cover, setCover] = React.useState("crop-white-clover");
  const bed: Bed = habitat.beds.find((b) => b.id === bedId) ?? habitat.beds[0];
  const here = habitat.cells.filter((c) => c.bedId === bed.id);
  const wanted = cropsWanted(recipes);
  const weights = Object.fromEntries(wanted.map((w) => [w.cropId, w.recipes]));
  const ids = [...wanted.map((w) => w.cropId), ...(helpers ? HELPERS : [])];
  const name = (id: string) => (cropById(id) ? cropName(cropById(id)!, lang) : id);

  const s: PlantingSuggestion | null = React.useMemo(
    () => (shown ? suggestPlanting(bed, plantCounts(bed, ids, here, weights), here, { seed, tallSide, ...(cover && { cover }) }) : null),
    // the inputs, as plain values: the suggestion is the same for the same ones
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shown, bed.id, bed.lengthCm, bed.widthCm, bed.cellCm, bed.wormBinCm, ids.join(","), here.length, seed, tallSide, cover],
  );
  const drawn = here.length ? scorePlanting(bed, here, { tallSide }) : null;
  const notHere = wanted.filter((w) => !cropById(w.cropId)?.needs.spacingCm || cropById(w.cropId)?.growthForm);
  const accept = () => {
    if (!s) return;
    edit((h) => ({ ...h, cells: [...h.cells, ...s.cells.map((p) => ({ id: newId("cell"), bedId: bed.id, row: p.row, col: p.col, cropId: p.cropId, status: "CellPlanned" as const }))] }));
    setShown(false);
  };

  return (
    <section className="pt-panel">
      <h2>{t("rec.plant")}</h2>
      <p className="pt-muted">{t("rec.plant.hint")}</p>
      <p>{wanted.map((w) => `${name(w.cropId)}${w.recipes > 1 ? ` ×${w.recipes}` : ""}`).join(", ")}</p>
      {notHere.length > 0 && <p className="pt-muted">{t("rec.plant.elsewhere", { crops: notHere.map((w) => name(w.cropId)).join(", ") })}</p>}
      <div className="pt-recipes__controls">
        {habitat.beds.length > 1 && (
          <label className="pt-field"><span>{t("rec.plant.bed")}</span>
            <select value={bed.id} onChange={(e) => { setBedId(e.target.value); setShown(false); }}>
              {habitat.beds.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select></label>
        )}
        <label className="pt-guild__check"><input type="checkbox" checked={helpers} onChange={(e) => setHelpers(e.target.checked)} />
          {t("rec.plant.helpers", { crops: HELPERS.map(name).join(", ") })}</label>
        <label className="pt-guild__check"><input type="checkbox" checked={tallSide === "last"} onChange={(e) => setTallSide(e.target.checked ? "last" : "first")} />
          {t("rec.plant.tall")}</label>
        <label className="pt-field"><span>{t("rec.plant.cover")}</span>
          <select value={cover} onChange={(e) => setCover(e.target.value)}>
            <option value="">{t("rec.plant.cover.none")}</option>
            {crops().filter((c) => c.coverCrop).map((c) => <option key={c.id} value={c.id}>{cropName(c, lang)}</option>)}
          </select></label>
        <button className="pt-button pt-button--ghost" onClick={() => { setShown(true); if (shown) setSeed((n) => n + 1); }}>
          {shown ? t("rec.plant.again") : t("rec.plant.suggest")}
        </button>
      </div>

      {s && (
        <>
          <Preview bed={bed} suggestion={s} habitat={habitat} />
          <p className="pt-recipes__legend">
            {s.crops.filter((c) => c.placed > 0).map((c) => (
              <span key={c.cropId}><span className="pt-recipe__dot" style={{ background: cropColor(c.cropId) }} />{c.placed} × {name(c.cropId)}</span>
            ))}
            {s.coverCells > 0 && <span><span className="pt-recipe__dot" style={{ background: cropColor(cover) }} />{s.coverCells} × {name(cover)}</span>}
          </p>
          <p>
            {t("rec.plant.result", { good: s.goodPairs, bad: s.badPairs, same: s.sameCropPairs, cover: Math.round(s.cover * 100) })}
            {s.fedByBuilder > 0 && <> {t("rec.plant.fed", { n: s.fedByBuilder })}</>}
            {s.coverCells > 0 && <> {t("rec.plant.covered", { n: s.coverCells, crop: name(cover) })}</>}
            {drawn && <> {t("rec.plant.drawn", { good: drawn.goodPairs, bad: drawn.badPairs, same: drawn.sameCropPairs })}</>}
          </p>
          {s.pairs.good.length > 0 && (
            <p className="pt-muted">{t("rec.plant.pairs")} {s.pairs.good.slice(0, 5).map(([a, b]) => `${name(a)} + ${name(b)}`).join("; ")}.</p>
          )}
          {s.crops.filter((c) => c.why).map((c) => (
            <p key={c.cropId} className="pt-muted">{name(c.cropId)}: {t(`rec.plant.why.${c.why}`, { placed: c.placed, wanted: c.wanted })}</p>
          ))}
          <p className="pt-muted">{t("rec.plant.caveat")}</p>
          {canEdit && <button className="pt-button" onClick={accept} disabled={s.cells.length === 0}>{t("rec.plant.accept", { n: s.cells.length })}</button>}
        </>
      )}
    </section>
  );
}

function Preview({ bed, suggestion, habitat }: { bed: Bed; suggestion: PlantingSuggestion; habitat: Habitat }) {
  const { t, lang } = useT();
  const { rows, cols } = bedGrid(bed);
  const binFrom = cols - wormBinCols(bed);
  const cell = new Map<string, { cropId: string; centre: boolean; old: boolean }>();
  const paint = (row: number, col: number, cropId: string, old: boolean) => {
    const f = footprint(cropId, bed), r0 = row - Math.floor((f - 1) / 2), c0 = col - Math.floor((f - 1) / 2);
    for (let r = r0; r < r0 + f; r++) for (let c = c0; c < c0 + f; c++) cell.set(`${r}|${c}`, { cropId, centre: r === row && c === col, old });
  };
  for (const c of habitat.cells) if (c.bedId === bed.id) paint(c.row, c.col, c.cropId, true);
  for (const p of suggestion.cells) paint(p.row, p.col, p.cropId, false);
  return (
    <div className="pt-bed__scroll">
      <div className="pt-bed pt-bed--preview" style={{ gridTemplateColumns: `repeat(${cols}, 1.25rem)` }} role="img" aria-label={t("rec.plant.preview")}>
        {Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => {
          const here = cell.get(`${r}|${c}`);
          if (c >= binFrom) return <span key={`${r}|${c}`} className="pt-bed__cell pt-bed__cell--bin" />;
          return (
            <span key={`${r}|${c}`}
              className={"pt-bed__cell" + (here ? (here.centre ? " pt-bed__cell--on" : " pt-bed__cell--near") : "") + (here?.old ? " pt-bed__cell--old" : "")}
              style={here ? { background: cropColor(here.cropId) } : undefined}
              title={here && cropById(here.cropId) ? cropName(cropById(here.cropId)!, lang) : undefined} />
          );
        }))}
      </div>
    </div>
  );
}
