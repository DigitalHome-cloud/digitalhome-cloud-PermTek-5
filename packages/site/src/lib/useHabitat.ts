import * as React from "react";
import { areaOfHomeId, checkHabitat, climateMonths, emptyHabitat, habitatFromTtl, habitatToTtl } from "@dlab5/permtek5-core";
import type { ClimateMonth, Habitat, Problem } from "@dlab5/permtek5-core";
import { listTenants, loadGraph, saveGraph } from "./data";
import { getAreaClimate, getArea, getHome } from "./dhcCore";

/**
 * A habitat's map, kept as its shared space's A-Box (docs/adr/0016).
 *
 * Edits go into a draft; save() checks it (cells inside beds, known crops),
 * writes it with the version it started from, and reports a conflict or the
 * shapes' problems instead of overwriting.
 */
export type SaveResult =
  | { ok: true }
  | { ok: false; kind: "check"; problems: Problem[] }
  | { ok: false; kind: "conflict" }
  | { ok: false; kind: "invalid"; messages: string[] };

export function useHabitat(spaceId: string) {
  const [saved, setSaved] = React.useState<Habitat | null>(null);
  const [draft, setDraft] = React.useState<Habitat | null>(null);
  const [version, setVersion] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(() => {
    setError(null);
    loadGraph(spaceId)
      .then((g) => {
        const h = g.ttl ? habitatFromTtl(g.ttl) : emptyHabitat();
        setSaved(h); setDraft(h); setVersion(g.version);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [spaceId]);
  React.useEffect(load, [load]);

  const dirty = !!draft && !!saved && draft !== saved;

  const save = async (next: Habitat | null = draft): Promise<SaveResult> => {
    if (!next) return { ok: true };
    const problems = checkHabitat(next);
    if (problems.length) return { ok: false, kind: "check", problems };
    setSaving(true);
    try {
      const r = await saveGraph(spaceId, await habitatToTtl(next), version);
      if (r.status === "conflict") return { ok: false, kind: "conflict" };
      if (r.status === "invalid") return { ok: false, kind: "invalid", messages: r.problems };
      setSaved(next); setDraft(next); setVersion(r.version);
      return { ok: true };
    } finally {
      setSaving(false);
    }
  };

  return {
    habitat: draft, version, error, dirty, saving,
    edit: (f: (h: Habitat) => Habitat) => setDraft((d) => (d ? f(d) : d)),
    discard: () => setDraft(saved),
    replace: (h: Habitat) => setDraft(h),
    save, reload: load,
  };
}

/**
 * The monthly normals of the habitat's area, read in place from DHC core
 * (docs/adr/0015). Null while unknown: a habitat without a home, a reader who
 * may not see the tenant row, or an area without weather yet.
 */
export function useAreaMonths(tenantId: string | undefined) {
  const [state, setState] = React.useState<{ months: ClimateMonth[] | null; areaName: string | null; done: boolean }>(
    { months: null, areaName: null, done: false });
  React.useEffect(() => {
    if (!tenantId) { setState({ months: null, areaName: null, done: true }); return; }
    let alive = true;
    (async () => {
      const tenant = (await listTenants().catch(() => [])).find((x) => x.id === tenantId);
      const homeId = tenant?.smartHomeId;
      let areaId = homeId ? areaOfHomeId(homeId) : null;
      if (!areaId && homeId) {
        const h = await getHome(homeId).catch(() => null);
        if (h) areaId = `${h.country}-${h.postalCode}`;
      }
      if (!areaId) return { months: null, areaName: null };
      const [c, a] = await Promise.all([getAreaClimate(areaId).catch(() => null), getArea(areaId).catch(() => null)]);
      return { months: c ? climateMonths(c.climate, c.solar, c.wind) : null, areaName: a?.name ?? areaId };
    })().then((r) => alive && setState({ ...r, done: true }));
    return () => { alive = false; };
  }, [tenantId]);
  return state;
}
