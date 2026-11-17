import { fetchAuthSession } from "aws-amplify/auth";
import { getUrl } from "aws-amplify/storage";
import { goldPath } from "@dlab5/permtek5-core";
import type { GoldClimate, GoldSolar, GoldWind, GoldWindow } from "@dlab5/permtek5-core";

/**
 * DigitalHome.Cloud core, read in place (docs/adr/0015).
 *
 * A habitat's home, its area and the area's weather belong to DHC core; this
 * site copies none of it. Both reads go out as the signed-in person: the core
 * API with their ID token (one user pool), the core bucket with their identity
 * pool credentials (one identity pool), so the core's own rules decide what
 * they see. Where the core is comes from the backend's outputs (custom.dhcCore),
 * looked up at deploy time; without it every read here returns null.
 */

interface CoreConfig { apiUrl: string; bucket: string; region: string }

function config(): CoreConfig | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
    const c = require("../amplify_outputs.json").custom?.dhcCore as CoreConfig | undefined;
    return c?.apiUrl && c.bucket && c.region ? c : null;
  } catch {
    return null;    // a build without a backend
  }
}

export const coreAvailable = () => config() !== null;

async function coreQuery<T>(query: string, variables: Record<string, unknown>): Promise<T | null> {
  const c = config();
  if (!c) return null;
  const token = (await fetchAuthSession()).tokens?.idToken?.toString();
  if (!token) return null;
  const r = await fetch(c.apiUrl, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: token },
    body: JSON.stringify({ query, variables }),
  });
  if (!r.ok) return null;
  return ((await r.json()) as { data?: T | null }).data ?? null;
}

export interface Home {
  smartHomeId: string;
  country: string;
  postalCode: string;
  city?: string | null;
  isDemo?: boolean | null;
  owners?: (string | null)[] | null;
}

/** The home, if the core shows it to this person (its owners, and dhc-admins). */
export async function getHome(smartHomeId: string): Promise<Home | null> {
  const d = await coreQuery<{ getDigitalHome: Home | null }>(
    `query GetHome($id: ID!) { getDigitalHome(smartHomeId: $id) { smartHomeId country postalCode city isDemo owners } }`,
    { id: smartHomeId },
  );
  return d?.getDigitalHome ?? null;
}

export interface Area { areaId: string; name: string; country: string; postalCode: string; lastIngestedAt?: string | null }

/** An area: any signed-in person reads it. */
export async function getArea(areaId: string): Promise<Area | null> {
  const d = await coreQuery<{ getArea: Area | null }>(
    `query GetArea($id: ID!) { getArea(areaId: $id) { areaId name country postalCode lastIngestedAt } }`,
    { id: areaId },
  );
  return d?.getArea ?? null;
}

async function gold<T>(areaId: string, file: "climate" | "solar" | "wind", window: GoldWindow): Promise<T | null> {
  const c = config();
  if (!c) return null;
  try {
    const { url } = await getUrl({
      path: goldPath(areaId, file, window),
      options: { bucket: { bucketName: c.bucket, region: c.region }, validateObjectExistence: true },
    });
    const r = await fetch(url.toString());
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;    // the area has no weather yet
  }
}

export interface AreaClimate { climate: GoldClimate; solar: GoldSolar | null; wind: GoldWind | null }

/** The area's climate normals, or null when the core has none for it. */
export async function getAreaClimate(areaId: string, window: GoldWindow = "all"): Promise<AreaClimate | null> {
  const [climate, solar, wind] = await Promise.all([
    gold<GoldClimate>(areaId, "climate", window),
    gold<GoldSolar>(areaId, "solar", window),
    gold<GoldWind>(areaId, "wind", window),
  ]);
  return climate ? { climate, solar, wind } : null;
}

/** The signed-in person's Cognito sub, as DHC core keeps home owners. */
export async function mySub(): Promise<string | null> {
  const s = await fetchAuthSession();
  return (s.tokens?.idToken?.payload?.sub as string | undefined) ?? s.userSub ?? null;
}
