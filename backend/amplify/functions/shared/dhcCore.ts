// DigitalHome.Cloud core, read on the caller's behalf (docs/adr/0015).
//
// PermTek-5 and DHC core share one user pool, so the caller's own ID token is
// accepted by the core's AppSync API. Asking the core with THAT token lets the
// core's own rules decide (a DigitalHome is readable by its owners and by
// dhc-admins): PermTek-5 keeps no copy of who owns what.

export interface DhcHome {
  smartHomeId: string; country: string; postalCode: string; isDemo?: boolean;
  /** Cognito subs, as core's createDigitalHome writes them. */
  owners?: (string | null)[] | null;
}

const GET_HOME = `query GetHome($id: ID!) {
  getDigitalHome(smartHomeId: $id) { smartHomeId country postalCode isDemo owners }
}`;

/** The home as the caller may see it, or null when the core will not show it to them. */
export async function homeAsCaller(
  smartHomeId: string,
  callerToken: string | undefined,
  apiUrl = process.env.DHC_CORE_API_URL,
  fetcher: typeof fetch = fetch,
): Promise<DhcHome | null> {
  if (!apiUrl) throw new Error("DHC_CORE_API_URL is not set: the core API is looked up at deploy time");
  if (!callerToken) return null;
  const r = await fetcher(apiUrl, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: callerToken },
    body: JSON.stringify({ query: GET_HOME, variables: { id: smartHomeId } }),
  });
  if (!r.ok) return null;
  const body = (await r.json()) as { data?: { getDigitalHome?: DhcHome | null } };
  return body.data?.getDigitalHome ?? null;
}

/**
 * Core shows a home to its owners AND to every dhc-admin, so getting it back is
 * not enough: an operator must not start (and so administer) someone's habitat.
 */
export const ownsHome = (home: DhcHome, ...ids: (string | undefined)[]) =>
  ids.some((id) => !!id && (home.owners ?? []).includes(id));

/** A home id as DHC mints them, e.g. DE-80331-MAR12-01, or a demo home (BE-DEMO). */
export const HOME_ID = /^[A-Z]{2}-[A-Z0-9]{2,10}(-[A-Z0-9]{2,12}){0,2}$/;

/** The DHC area a home lies in: weather and climate are keyed by it. */
export const areaOf = (h: Pick<DhcHome, "country" | "postalCode">) => `${h.country}-${h.postalCode}`;
