/**
 * Mixed planting: where each plant goes in a bed (docs/adr/0021).
 *
 * In permaculture a bed is not planted in blocks. Neighbours are chosen by
 * what they take from the soil and give to it: a heavy feeder beside a soil
 * builder, deep roots beside shallow ones, a scented crop between the ones
 * pests look for, traditional good neighbours side by side and bad ones
 * apart. The crop library carries those attributes (library.ts, CropMix).
 *
 * `plantCounts()` says how many plants of each wanted crop fit. `suggestPlanting()`
 * places them: every plant keeps its spacing, then positions are improved
 * until no swap or move makes the bed better. `scorePlanting()` reads any
 * planting the same way, so a bed as drawn can be compared with a suggestion.
 *
 * A SUGGESTION, from traditional companion-planting guidance whose evidence
 * is mixed. A person accepts it or not, and the bed itself has the last word.
 * The same input gives the same output.
 */
import { cropById, isWoody, type CropMix } from "./library.js";
import { bedGrid, footprint, wormBinCols, type Bed, type Cell } from "./habitatModel.js";
import { plantSetById, type PlantSet } from "./plantSets.js";

/**
 * Where a plant stands in height (docs/adr/0027). A low crop that covers the soil (`ground`) may grow under a
 * `tall`, upright one, inside its spacing: thyme under a tomato. Every other pair keeps its spacing. One plant
 * per layer in a cell.
 */
export type Layer = "tall" | "mid" | "ground";
const GROUND_MAX_CM = 40;

export function layerOf(cropId: string): Layer {
  const m = cropById(cropId)?.mix;
  if (!m) return "mid";
  if (m.gives.includes("CoversSoil")) return m.heightCm <= GROUND_MAX_CM ? "ground" : "mid";
  return m.heightCm >= TALL_CM ? "tall" : "mid";
}

/** Two plants may share cells only when one is tall and the other grows under it. */
const mayShare = (a: string, b: string) => {
  const x = layerOf(a), y = layerOf(b);
  return (x === "tall" && y === "ground") || (x === "ground" && y === "tall");
};

export interface Placement { row: number; col: number; cropId: string }

export interface PlantingScore {
  score: number;
  /** Pairs of neighbouring plants, counted once each. */
  goodPairs: number;
  badPairs: number;
  /** Neighbours of the same crop: what a block planting is made of. */
  sameCropPairs: number;
  /** Heavy feeders with a soil builder beside them. */
  fedByBuilder: number;
  /** The good and bad pairs by crop, most frequent first: [cropA, cropB, how often]. */
  pairs: { good: [string, string, number][]; bad: [string, string, number][] };
}

export interface PlantingSuggestion extends PlantingScore {
  cells: Placement[];
  /** Per crop: how many were wanted and placed, and why some are not in the bed at all. */
  crops: { cropId: string; wanted: number; placed: number; why?: "tree" | "tooBig" | "noSpacing" | "unknown" | "noRoom" }[];
  /** Share of the plantable cells that are covered, 0..1. */
  cover: number;
  /** How many of `cells` are the cover crop, sown into the gaps. */
  coverCells: number;
}

export interface PlantingOptions {
  seed?: number;
  /** Which long side tall crops go to, so they do not shade the rest: the first row (default) or the last. */
  tallSide?: "first" | "last";
  /** How much of the free bed to fill when counting plants, 0..1. */
  fill?: number;
  /** A cover crop's id: it is sown into every cell the plants leave free, so no soil stays bare. */
  cover?: string;
}

const W = {
  good: 3, bad: -10, sameCrop: -1.2, sameFamily: -1.5,
  heavyHeavy: -2, heavyBuilder: 5, rootsDiffer: 0.8, rootsSame: -0.4, scent: 0.6,
  tallPerRow: -0.25, heavyNearBox: 1.5, coverAtEdge: 0.8, underTall: 1,
};
const TALL_CM = 70;
/** Bare soil is not wanted, and a gantry needs no paths: nine tenths of the free bed are planted. */
const DEFAULT_FILL = 0.9;

/** A small seeded generator (mulberry32): the same seed gives the same bed. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Why a crop cannot go into this bed, or undefined when it can. */
function unfit(cropId: string, bed: Bed): "tree" | "tooBig" | "noSpacing" | "unknown" | undefined {
  const crop = cropById(cropId);
  if (!crop) return "unknown";
  if (isWoody(crop)) return "tree";
  if (!crop.needs.spacingCm) return "noSpacing";
  const { rows, cols } = bedGrid(bed);
  const f = footprint(cropId, bed);
  return f > rows || f > cols - wormBinCols(bed) ? "tooBig" : undefined;
}

class Grid {
  readonly rows: number; readonly cols: number;
  /** For every cell, the index of the plant that covers it, or -1. */
  readonly owner: Int32Array;
  /** For every cell under a tall plant, the index of the ground plant growing beneath it, or -1. */
  readonly under: Int32Array;
  readonly plants: { row: number; col: number; cropId: string; f: number; mix?: CropMix; fixed: boolean; layer: Layer }[] = [];
  constructor(readonly bed: Bed, readonly tallSide: "first" | "last") {
    const g = bedGrid(bed);
    this.rows = g.rows;
    this.cols = g.cols - wormBinCols(bed);
    this.owner = new Int32Array(this.rows * this.cols).fill(-1);
    this.under = new Int32Array(this.rows * this.cols).fill(-1);
  }
  private block(row: number, col: number, f: number) {
    const r0 = row - Math.floor((f - 1) / 2), c0 = col - Math.floor((f - 1) / 2);
    return { r0, c0, r1: r0 + f - 1, c1: c0 + f - 1 };
  }
  /** Whether a plant of `layer` fits with its block at row/col; `ignore` is the plant being moved. */
  fits(row: number, col: number, f: number, ignore = -1, layer: Layer = "mid"): boolean {
    const { r0, c0, r1, c1 } = this.block(row, col, f);
    if (r0 < 0 || c0 < 0 || r1 >= this.rows || c1 >= this.cols) return false;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const k = r * this.cols + c, o = this.owner[k], u = this.under[k];
        if (u !== -1 && u !== ignore && layer !== "ground") return false;      // nothing tall goes over a plant left beneath
        if (o === -1 || o === ignore) continue;
        if (layer === "ground" && this.plants[o].layer === "tall" && (u === -1 || u === ignore)) continue;
        return false;
      }
    }
    return true;
  }
  private paint(i: number, on: boolean) {
    const p = this.plants[i];
    const { r0, c0, r1, c1 } = this.block(p.row, p.col, p.f);
    for (let r = Math.max(0, r0); r <= Math.min(this.rows - 1, r1); r++) {
      for (let c = Math.max(0, c0); c <= Math.min(this.cols - 1, c1); c++) {
        const k = r * this.cols + c;
        if (!on) {
          if (this.owner[k] === i) this.owner[k] = -1;
          if (this.under[k] === i) this.under[k] = -1;
        } else if (this.owner[k] === -1) this.owner[k] = i;
        else if (p.layer === "ground" && this.plants[this.owner[k]].layer === "tall" && this.under[k] === -1) this.under[k] = i;
      }
    }
  }
  add(row: number, col: number, cropId: string, fixed = false): number {
    const i = this.plants.length;
    this.plants.push({ row, col, cropId, f: footprint(cropId, this.bed), mix: cropById(cropId)?.mix, fixed, layer: layerOf(cropId) });
    this.paint(i, true);
    return i;
  }
  move(i: number, row: number, col: number) { this.paint(i, false); this.plants[i].row = row; this.plants[i].col = col; this.paint(i, true); }
  lift(i: number) { this.paint(i, false); }
  drop(i: number) { this.paint(i, true); }
  /** Whether a ground plant grows under plant i: then i stays where it is. */
  shelters(i: number): boolean {
    const p = this.plants[i];
    if (p.layer !== "tall") return false;
    const { r0, c0, r1, c1 } = this.block(p.row, p.col, p.f);
    for (let r = Math.max(0, r0); r <= Math.min(this.rows - 1, r1); r++) for (let c = Math.max(0, c0); c <= Math.min(this.cols - 1, c1); c++) {
      const k = r * this.cols + c;
      if (this.owner[k] === i && this.under[k] !== -1) return true;
    }
    return false;
  }
  /** The plants whose blocks touch plant i's block (side or corner), and those that grow over or under it. */
  neighbours(i: number): number[] {
    const p = this.plants[i];
    const { r0, c0, r1, c1 } = this.block(p.row, p.col, p.f);
    const seen = new Set<number>();
    for (let r = Math.max(0, r0 - 1); r <= Math.min(this.rows - 1, r1 + 1); r++) {
      for (let c = Math.max(0, c0 - 1); c <= Math.min(this.cols - 1, c1 + 1); c++) {
        for (const o of [this.owner[r * this.cols + c], this.under[r * this.cols + c]]) if (o !== -1 && o !== i) seen.add(o);
      }
    }
    return [...seen];
  }
  /** How many of a ground plant's cells are under a tall plant. */
  private sheltered(i: number): number {
    const p = this.plants[i];
    const { r0, c0, r1, c1 } = this.block(p.row, p.col, p.f);
    let n = 0;
    for (let r = Math.max(0, r0); r <= Math.min(this.rows - 1, r1); r++) for (let c = Math.max(0, c0); c <= Math.min(this.cols - 1, c1); c++) if (this.under[r * this.cols + c] === i) n++;
    return n;
  }
  /** What two neighbouring plants are worth to each other. */
  pair(a: number, b: number): number {
    const A = this.plants[a], B = this.plants[b];
    if (A.cropId === B.cropId) return W.sameCrop;
    const x = A.mix, y = B.mix;
    if (!x || !y) return 0;
    let s = 0;
    if (x.good.includes(B.cropId)) s += W.good;
    if (x.bad.includes(B.cropId)) s += W.bad;
    if (x.family === y.family) s += W.sameFamily;
    const heavy = (m: CropMix) => m.feeding === "HeavyFeeder", builder = (m: CropMix) => m.feeding === "SoilBuilder";
    if (heavy(x) && heavy(y)) s += W.heavyHeavy;
    if ((heavy(x) && builder(y)) || (heavy(y) && builder(x))) s += W.heavyBuilder;
    s += x.rootDepth === y.rootDepth ? W.rootsSame : W.rootsDiffer;
    if (x.family !== y.family && (x.gives.includes("ConfusesPests") || y.gives.includes("ConfusesPests"))) s += W.scent;
    return s;
  }
  /** What a plant's own place is worth: tall ones at their side, heavy feeders near the worm box, trailing ones at an edge. */
  place(i: number): number {
    const p = this.plants[i], m = p.mix;
    if (!m) return 0;
    let s = 0;
    if (m.heightCm >= TALL_CM) s += W.tallPerRow * (m.heightCm / 100) * (this.tallSide === "first" ? p.row : this.rows - 1 - p.row);
    if (m.feeding === "HeavyFeeder" && wormBinCols(this.bed)) s += W.heavyNearBox * (p.col / Math.max(1, this.cols - 1));
    if (m.gives.includes("CoversSoil") && (p.row - Math.floor((p.f - 1) / 2) === 0 || p.row - Math.floor((p.f - 1) / 2) + p.f === this.rows)) s += W.coverAtEdge;
    if (p.layer === "ground") s += W.underTall * (this.sheltered(i) / (p.f * p.f));
    return s;
  }
  at(i: number): number {
    let s = this.place(i);
    for (const n of this.neighbours(i)) s += this.pair(i, n);
    return s;
  }
  summary(): PlantingScore {
    let score = 0, goodPairs = 0, badPairs = 0, sameCropPairs = 0;
    const fed = new Set<number>();
    const good = new Map<string, number>(), bad = new Map<string, number>();
    for (let i = 0; i < this.plants.length; i++) {
      score += this.place(i);
      for (const n of this.neighbours(i)) {
        if (n < i) continue;
        score += this.pair(i, n);
        const A = this.plants[i], B = this.plants[n];
        const key = [A.cropId, B.cropId].sort().join("|");
        if (A.cropId === B.cropId) sameCropPairs++;
        else if (A.mix?.good.includes(B.cropId)) { goodPairs++; good.set(key, (good.get(key) ?? 0) + 1); }
        else if (A.mix?.bad.includes(B.cropId)) { badPairs++; bad.set(key, (bad.get(key) ?? 0) + 1); }
        if (A.mix?.feeding === "HeavyFeeder" && B.mix?.feeding === "SoilBuilder") fed.add(i);
        if (B.mix?.feeding === "HeavyFeeder" && A.mix?.feeding === "SoilBuilder") fed.add(n);
      }
    }
    const list = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([k, n]) => [...k.split("|"), n] as [string, string, number]);
    return { score: Math.round(score * 10) / 10, goodPairs, badPairs, sameCropPairs, fedByBuilder: fed.size, pairs: { good: list(good), bad: list(bad) } };
  }
}

const LAYER_ORDER: Record<Layer, number> = { tall: 0, mid: 1, ground: 2 };

function gridOf(bed: Bed, existing: Cell[], tallSide: "first" | "last"): Grid {
  const g = new Grid(bed, tallSide);
  // tall plants first, so what grows under them finds them there
  const mine = existing.filter((c) => c.bedId === bed.id && c.col < g.cols && c.row < g.rows)
    .sort((a, b) => LAYER_ORDER[layerOf(a.cropId)] - LAYER_ORDER[layerOf(b.cropId)]);
  for (const c of mine) g.add(c.row, c.col, c.cropId, true);
  return g;
}

/** Read a planting as it is: its good and bad neighbours, its blocks, its score. */
export function scorePlanting(bed: Bed, cells: Cell[], opts: PlantingOptions = {}): PlantingScore {
  return gridOf(bed, cells, opts.tallSide ?? "first").summary();
}

/**
 * How many plants of each wanted crop fit into what is free in the bed. Every crop that can grow there
 * gets one plant; the rest of the room goes round by `weights` (say, how many recipes use the crop),
 * so that each crop gets a like share of the AREA: one courgette, a row's worth of carrots.
 */
export function plantCounts(bed: Bed, cropIds: string[], existing: Cell[] = [], weights: Record<string, number> = {},
  opts: PlantingOptions = {}): Record<string, number> {
  const g = gridOf(bed, existing, "first");
  let free = 0;
  for (const o of g.owner) if (o === -1) free++;
  const budget = free * (opts.fill ?? DEFAULT_FILL);
  const ids = [...new Set(cropIds)].filter((id) => !unfit(id, bed)).sort((a, b) => footprint(b, bed) - footprint(a, bed) || a.localeCompare(b));
  const area = (id: string) => footprint(id, bed) ** 2;
  const counts: Record<string, number> = {};
  let used = 0;
  for (const id of ids) { if (used + area(id) > budget && used > 0) continue; counts[id] = 1; used += area(id); }
  for (;;) {
    // the crop that has had least area for its weight, and still fits the budget
    const next = Object.keys(counts).filter((id) => used + area(id) <= budget)
      .sort((a, b) => (counts[a] * area(a)) / (weights[a] ?? 1) - (counts[b] * area(b)) / (weights[b] ?? 1) || a.localeCompare(b))[0];
    if (!next) break;
    counts[next]++;
    used += area(next);
  }
  return counts;
}

/**
 * Place `wants` (crop id -> number of plants) in the bed's free cells, mixed. Plants already in the bed
 * (`existing`) stay where they are and count as neighbours.
 */
export function suggestPlanting(bed: Bed, wants: Record<string, number>, existing: Cell[] = [], opts: PlantingOptions = {}): PlantingSuggestion {
  const rand = rng(opts.seed ?? 5);
  const g = gridOf(bed, existing, opts.tallSide ?? "first");
  const fixed = g.plants.length;
  const crops: PlantingSuggestion["crops"] = [];
  const queue: string[] = [];
  for (const [cropId, wanted] of Object.entries(wants).sort((a, b) => a[0].localeCompare(b[0]))) {
    const why = unfit(cropId, bed);
    crops.push({ cropId, wanted, placed: 0, ...(why && { why }) });
    if (!why) for (let i = 0; i < wanted; i++) queue.push(cropId);
  }
  // big plants first, and the crops in turn, so no crop takes all the good places
  const turn = new Map<string, number>();
  const order = queue.map((cropId) => { const n = turn.get(cropId) ?? 0; turn.set(cropId, n + 1); return { cropId, n }; })
    .sort((a, b) => (layerOf(a.cropId) === "ground" ? 1 : 0) - (layerOf(b.cropId) === "ground" ? 1 : 0)
      || footprint(b.cropId, bed) - footprint(a.cropId, bed) || a.n - b.n || a.cropId.localeCompare(b.cropId));

  const best = (i: number, cropId: string): { row: number; col: number } | undefined => {
    const f = footprint(cropId, bed), layer = layerOf(cropId);
    let top: { row: number; col: number; s: number } | undefined;
    for (let row = 0; row < g.rows; row++) {
      for (let col = 0; col < g.cols; col++) {
        if (!g.fits(row, col, f, i, layer)) continue;
        g.move(i, row, col);
        const s = g.at(i) + rand() * 0.2;                 // a little chance, so equal places are not always the first
        if (!top || s > top.s) top = { row, col, s };
      }
    }
    return top;
  };

  for (const { cropId } of order) {
    const f = footprint(cropId, bed), layer = layerOf(cropId);
    let spot: { row: number; col: number } | undefined;
    for (let row = 0; row < g.rows && !spot; row++) for (let col = 0; col < g.cols && !spot; col++) if (g.fits(row, col, f, -1, layer)) spot = { row, col };
    if (!spot) continue;                                   // no room left for this one
    const i = g.add(spot.row, spot.col, cropId);
    const at = best(i, cropId);
    if (at) g.move(i, at.row, at.col);
    crops.find((c) => c.cropId === cropId)!.placed++;
  }

  // improve: move a plant to its best free place, or swap two of the same size, while that makes the bed better
  const mine = () => fixed + Math.floor(rand() * (g.plants.length - fixed));
  const tries = Math.min(4000, (g.plants.length - fixed) * 40);
  for (let n = 0; n < tries && g.plants.length - fixed > 1; n++) {
    const a = mine(), b = mine();
    const A = g.plants[a], B = g.plants[b];
    if (a === b || A.cropId === B.cropId) continue;
    if (A.f === B.f && A.layer === B.layer) {
      const before = g.at(a) + g.at(b);
      const [ar, ac, br, bc] = [A.row, A.col, B.row, B.col];
      g.lift(a); g.lift(b);
      A.row = br; A.col = bc; B.row = ar; B.col = ac;
      g.drop(a); g.drop(b);
      if (g.at(a) + g.at(b) <= before + 1e-9) { g.lift(a); g.lift(b); A.row = ar; A.col = ac; B.row = br; B.col = bc; g.drop(a); g.drop(b); }
    } else if ((n % 5 === 0 || g.at(a) < 0) && !g.shelters(a)) {      // a plant with a bad neighbour looks for a better place
      const before = g.at(a), [row, col] = [A.row, A.col];
      const at = best(a, A.cropId);
      if (at) g.move(a, at.row, at.col);
      if (g.at(a) <= before + 1e-9) g.move(a, row, col);
    }
  }

  // last: a plant that still has a bad neighbour tries every swap with a plant of its size and layer
  const badNext = (i: number) => g.neighbours(i).some((n) => g.plants[i].mix?.bad.includes(g.plants[n].cropId));
  const swap = (a: number, b: number) => {
    const A = g.plants[a], B = g.plants[b];
    g.lift(a); g.lift(b);
    [A.row, A.col, B.row, B.col] = [B.row, B.col, A.row, A.col];
    g.drop(a); g.drop(b);
  };
  for (let a = fixed; a < g.plants.length; a++) {
    if (!badNext(a)) continue;
    for (let b = fixed; b < g.plants.length && badNext(a); b++) {
      const A = g.plants[a], B = g.plants[b];
      if (a === b || A.cropId === B.cropId || A.f !== B.f || A.layer !== B.layer) continue;
      const before = g.at(a) + g.at(b);
      swap(a, b);
      if (g.at(a) + g.at(b) <= before + 1e-9) swap(a, b);
    }
  }

  for (const c of crops) if (!c.why && c.placed < c.wanted) c.why = "noRoom";
  // The score and the neighbours are those of the crops; then what they leave free is sown with a cover crop.
  const summary = g.summary();
  let coverCells = 0;
  if (opts.cover && !unfit(opts.cover, bed)) {
    const f = footprint(opts.cover, bed);
    const layer = layerOf(opts.cover);
    for (let row = 0; row < g.rows; row++) for (let col = 0; col < g.cols; col++) if (g.fits(row, col, f, -1, layer)) { g.add(row, col, opts.cover); coverCells++; }
  }
  let covered = 0;
  for (const o of g.owner) if (o !== -1) covered++;
  const cells = g.plants.slice(fixed).map((p) => ({ row: p.row, col: p.col, cropId: p.cropId }))
    .sort((a, b) => a.row - b.row || a.col - b.col);
  return { ...summary, cells, crops, coverCells, cover: Math.round((covered / Math.max(1, g.owner.length)) * 100) / 100 };
}

export interface SetChoice { setId: string; share: number }

export interface SetPlan extends PlantingSuggestion {
  /** Per set: the crops it asked for and how many of each were placed. */
  sets: { setId: string; crops: { cropId: string; placed: number; why?: PlantingSuggestion["crops"][number]["why"] }[] }[];
}

/**
 * Plan a bed from plant sets (docs/adr/0027). Each set gets its share of the free room, and within it each
 * member its share; the biggest plants are placed first and the little ones last, low ground covers under the
 * tall plants where they may. Plants already in the bed stay. `own` are the space's own sets.
 */
export function planFromSets(bed: Bed, choices: SetChoice[], existing: Cell[] = [], opts: PlantingOptions = {}, own: PlantSet[] = []): SetPlan {
  const weights: Record<string, number> = {};
  const used: { setId: string; members: string[] }[] = [];
  const total = choices.reduce((n, c) => n + Math.max(0, c.share), 0) || 1;
  for (const c of choices) {
    const set = plantSetById(c.setId, own);
    if (!set || c.share <= 0) continue;
    const sum = set.members.reduce((n, m) => n + m.share, 0) || 1;
    for (const m of set.members) weights[m.cropId] = (weights[m.cropId] ?? 0) + (c.share / total) * (m.share / sum);
    used.push({ setId: set.id, members: set.members.map((m) => m.cropId) });
  }
  // plantCounts shares AREA by weight; a crop's weight is its area share
  const counts = plantCounts(bed, Object.keys(weights), existing, weights, opts);
  const plan = suggestPlanting(bed, { ...Object.fromEntries(Object.keys(weights).map((id) => [id, 0])), ...counts }, existing, opts);
  const byCrop = new Map(plan.crops.map((c) => [c.cropId, c]));
  return {
    ...plan,
    crops: plan.crops.filter((c) => c.wanted > 0 || c.why),
    sets: used.map((u) => ({
      setId: u.setId,
      crops: u.members.map((id) => {
        const c = byCrop.get(id);
        const why = c?.why ?? (!c?.wanted ? "noRoom" : undefined);     // no room left for even one
        return { cropId: id, placed: c?.placed ?? 0, ...(why && { why }) };
      }),
    })),
  };
}

/** The plant cells `cell` would grow into, inside the bed: its block, centred on it. */
function blockIn(bed: Bed, row: number, col: number, cropId: string) {
  const f = footprint(cropId, bed), h = Math.floor((f - 1) / 2);
  const { rows, cols } = bedGrid(bed);
  return { r0: Math.max(0, row - h), c0: Math.max(0, col - h), r1: Math.min(rows - 1, row - h + f - 1), c1: Math.min(cols - 1, col - h + f - 1) };
}

/**
 * Planting by hand: the plant already in the bed that a new one at row/col would grow into, or undefined when
 * it has room. Spacing is checked inside the bed only (a plant at the edge may lean over it), and a low ground
 * cover may go under a tall plant. `ignore` is the cell being replaced or moved.
 */
export function plantingConflict(bed: Bed, cells: Cell[], row: number, col: number, cropId: string, ignore?: string): Cell | undefined {
  const a = blockIn(bed, row, col, cropId);
  return cells.find((c) => {
    if (c.bedId !== bed.id || c.id === ignore) return false;
    if (c.row === row && c.col === col && !mayShare(cropId, c.cropId)) return true;
    if (mayShare(cropId, c.cropId)) return false;
    const b = blockIn(bed, c.row, c.col, c.cropId);
    return a.r0 <= b.r1 && b.r0 <= a.r1 && a.c0 <= b.c1 && b.c0 <= a.c1;
  });
}

/** The cells of a bed that stand inside another plant's spacing (planted by hand, or imported). */
export function crowdedCells(bed: Bed, cells: Cell[]): Set<string> {
  const mine = cells.filter((c) => c.bedId === bed.id);
  const out = new Set<string>();
  for (const c of mine) {
    const other = plantingConflict(bed, mine, c.row, c.col, c.cropId, c.id);
    if (other) { out.add(c.id); out.add(other.id); }
  }
  return out;
}

/**
 * Share plant sets out over a farm's beds (docs/adr/0027): each set gets beds by its share, at least one while
 * there are beds enough; with fewer beds than sets, a bed takes two (or more) sets. Then each bed is planned.
 */
export function shareOut(bedIds: string[], choices: SetChoice[]): Map<string, SetChoice[]> {
  const out = new Map<string, SetChoice[]>(bedIds.map((id) => [id, []]));
  const sets = choices.filter((c) => c.share > 0).sort((a, b) => b.share - a.share || a.setId.localeCompare(b.setId));
  if (!sets.length || !bedIds.length) return out;
  if (sets.length > bedIds.length) {
    const per = Math.ceil(sets.length / bedIds.length);
    sets.forEach((c, i) => out.get(bedIds[Math.floor(i / per)])!.push({ ...c, share: 1 }));
    return out;
  }
  const total = sets.reduce((n, c) => n + c.share, 0);
  const n = sets.map((c) => 1 + ((c.share / total) * (bedIds.length - sets.length)));
  const counts = n.map(Math.floor);
  // the beds left over go to the largest remainders
  let left = bedIds.length - counts.reduce((a, b) => a + b, 0);
  for (const i of n.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map(([, i]) => i)) {
    if (left-- <= 0) break;
    counts[i]++;
  }
  let k = 0;
  sets.forEach((c, i) => { for (let j = 0; j < counts[i]; j++) out.get(bedIds[k++])!.push({ ...c, share: 1 }); });
  return out;
}

/** A farm's options: `same` plants every bed from all the chosen sets, instead of sharing the sets out (docs/adr/0028). */
export interface FarmOptions extends PlantingOptions { same?: boolean }

export function planFarm(beds: Bed[], choices: SetChoice[], existing: Cell[] = [], opts: FarmOptions = {}, own: PlantSet[] = []):
  { bedId: string; choices: SetChoice[]; plan: SetPlan }[] {
  const shares = opts.same
    ? new Map(beds.map((b) => [b.id, choices.filter((c) => c.share > 0)]))
    : shareOut(beds.map((b) => b.id), choices);
  return beds.map((b) => ({ bedId: b.id, choices: shares.get(b.id) ?? [], plan: planFromSets(b, shares.get(b.id) ?? [], existing, opts, own) }));
}
