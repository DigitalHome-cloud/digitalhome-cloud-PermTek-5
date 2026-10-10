/**
 * Recipes: what a household wants to eat, and so what it plants.
 *
 * The shared recipes come from packages/ontology/abox/recipes/*.ttl
 * (tools/export_library.py writes recipes.generated.ts; its test fails on
 * drift). A household's own recipes live in its space's A-Box, as
 * schema:Recipe with perma:IngredientUse lines (habitatGraph.ts).
 *
 * A line keeps its text as written. Where its ingredient is a crop of the
 * library it is linked to that crop: those lines can come from the garden,
 * the others are bought.
 */
import { crops, type LibraryCrop } from "./library.js";
import { RECIPES } from "./recipes.generated.js";

export interface RecipeLine {
  text: string;
  cropId?: string;
  /** Leaf, Root, Fruit, Bulb, Seed, Flower, Tuber. */
  part?: string;
  /** How the ingredient may arrive: Fresh, Cellar, Dried, Frozen, Pickled, ... */
  methods?: string[];
}

export interface Recipe {
  /** Local id, e.g. "recipe-ratatouille"; a household's own recipes carry their full IRI. */
  id: string;
  names: { en?: string; fr?: string; de?: string };
  yield?: string;
  description?: string;
  keepsAs?: string | null;
  lines: RecipeLine[];
  steps?: string[];
}

export const sharedRecipes = (): Recipe[] => RECIPES;

export const recipeName = (r: Recipe, lang: string): string =>
  (r.names as Record<string, string | undefined>)[lang] ?? r.names.fr ?? r.names.en ?? r.names.de ?? r.id;

/** The crops a set of recipes asks for, each with the number of recipes that use it. Most wanted first. */
export function cropsWanted(recipes: Recipe[]): { cropId: string; recipes: number }[] {
  const count = new Map<string, number>();
  for (const r of recipes) for (const id of new Set(r.lines.map((l) => l.cropId).filter(Boolean) as string[])) count.set(id, (count.get(id) ?? 0) + 1);
  return [...count].map(([cropId, n]) => ({ cropId, recipes: n })).sort((a, b) => b.recipes - a.recipes || a.cropId.localeCompare(b.cropId));
}

const plain = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/œ/g, "oe").replace(/ß/g, "ss");
/** Words that name a crop loosely, beyond the library's own names (a household writes "cornichons", not "concombre"). */
const ALSO: Record<string, string[]> = {
  "crop-cucumber": ["cornichon", "gherkin", "gewurzgurke", "essiggurke"],
  "crop-sweet-pepper": ["paprika", "piment doux", "poivron"],
  "crop-white-mustard": ["moutarde", "mustard", "senf"],
  "crop-rocket": ["rucola", "arugula"],
  "crop-onion": ["oignon rouge", "red onion", "echalote", "shallot"],
  "crop-spring-onion": ["ciboule", "cebette", "scallion", "fruhlingszwiebel"],
  "crop-bush-bean": ["haricot vert", "green bean", "grune bohne"],
  "crop-tomato": ["tomate"],
  "crop-courgette": ["zucchini"],
};
/** What marks an ingredient as kept, not fresh. */
const KEPT: [RegExp, string][] = [
  [/poudre|seche|fume|powder|dried|smoked|getrocknet|pulver|gerauchert/, "Dried"],
  [/cornichon|vinaigre|pickle|gherkin|essig/, "Pickled"],
  [/surgele|congele|frozen|tiefkuhl|gefroren/, "Frozen"],
];

function namesOf(c: LibraryCrop): string[] {
  const own = [c.names.fr, c.names.en, c.names.de].filter(Boolean).map((n) => plain(n as string));
  return [...own, ...(ALSO[c.id] ?? [])];
}

/** The library crop a line of text names, if any: the longest name that appears as a word (plural allowed). */
export function matchCrop(text: string): LibraryCrop | undefined {
  const t = ` ${plain(text).replace(/[^a-z0-9]+/g, " ")} `;
  let best: { crop: LibraryCrop; length: number } | undefined;
  for (const crop of crops()) {
    for (const name of namesOf(crop)) {
      if (name.length < 3) continue;
      if ((t.includes(` ${name} `) || t.includes(` ${name}s `) || t.includes(` ${name}n `) || t.includes(` ${name}x `)) && (!best || name.length > best.length)) {
        best = { crop, length: name.length };
      }
    }
  }
  return best?.crop;
}

/**
 * A pasted list of ingredients, as recipe lines. One line per ingredient; bullets, blank lines and
 * headings that end in ":" are dropped. Each line is matched to a crop where one is named; its part
 * is the crop's first harvested part, and it is taken as kept (dried, pickled) when the words say so.
 * A suggestion for a person to check, never saved unseen.
 */
export function parseIngredients(text: string): RecipeLine[] {
  const out: RecipeLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^[\s\-–•*·]+/, "").trim();
    if (!line || /:\s*$/.test(line) || /^ingr[eé]dients?\b/i.test(line) || /^(zutaten|ingredients)\b/i.test(line)) continue;
    const crop = matchCrop(line);
    if (!crop) { out.push({ text: line }); continue; }
    const kept = KEPT.find(([re]) => re.test(plain(line)))?.[1];
    out.push({ text: line, cropId: crop.id, part: crop.parts[0], methods: [kept ?? "Fresh"] });
  }
  return out;
}
