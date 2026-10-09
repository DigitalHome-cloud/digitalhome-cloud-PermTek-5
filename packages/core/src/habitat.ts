/**
 * A habitat: the permaculture side of one DigitalHome.Cloud home (docs/adr/0015).
 *
 * The home lives in DHC core; PermTek-5 keeps only its id on the tenant. What
 * follows from the home (its area, the area's climate) is read from the core
 * in place and shaped here, so the page only renders.
 */

/** DHC's home ids carry their area: {country}-{postalCode}-{street}{number}-{suffix}. */
const MINTED_HOME = /^([A-Z]{2})-([A-Z0-9]{2,10})-[A-Z0-9]+-[A-Z0-9]+$/;

/**
 * The area (`{country}-{postalCode}`) a home lies in, read off its id; null for
 * an id that does not carry one (old demo ids such as "BE-DEMO"), whose area
 * then has to come from the home row itself.
 */
export function areaOfHomeId(smartHomeId: string): string | null {
  const m = MINTED_HOME.exec(smartHomeId.trim().toUpperCase());
  return m ? `${m[1]}-${m[2]}` : null;
}

/** The weather gold the core's pipeline writes per area and window. */
export type GoldWindow = "all" | "10y" | "5y" | "3y" | "1y";
export const goldPath = (areaId: string, file: "climate" | "solar" | "wind" | "summary", window: GoldWindow = "all") =>
  `public/weather/gold/${areaId}/${window}/${file}.json`;

/** The parts of climate.json / solar.json / wind.json the Climate card shows. */
export interface GoldClimate {
  monthly: { min: number[]; mean: number[]; max: number[] };
  rain?: { monthly_mm: number[]; annual_mm?: number };
  mean_temp_c?: number;
}
export interface GoldSolar { monthly: { ghi: number[] } }
export interface GoldWind { monthly_mean_ms: number[] }

/** One month of the area's normals. `min` is the mean of the daily minima. */
export interface ClimateMonth {
  month: number;      // 1..12
  minC: number | null;
  meanC: number | null;
  maxC: number | null;
  rainMm: number | null;
  /** Global horizontal irradiation, kWh/m² per day. */
  sunKwhM2: number | null;
  windMs: number | null;
  /** A typical night below 0 °C: the mean daily minimum is under freezing. */
  frost: boolean;
  /** Nights can still freeze: the mean daily minimum is under 5 °C. */
  frostRisk: boolean;
}

const at = (xs: number[] | undefined, i: number) => {
  const v = xs?.[i];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
};

export function climateMonths(climate: GoldClimate, solar?: GoldSolar | null, wind?: GoldWind | null): ClimateMonth[] {
  return Array.from({ length: 12 }, (_, i) => {
    const minC = at(climate.monthly.min, i);
    return {
      month: i + 1,
      minC,
      meanC: at(climate.monthly.mean, i),
      maxC: at(climate.monthly.max, i),
      rainMm: at(climate.rain?.monthly_mm, i),
      sunKwhM2: at(solar?.monthly.ghi, i),
      windMs: at(wind?.monthly_mean_ms, i),
      frost: minC !== null && minC < 0,
      frostRisk: minC !== null && minC < 5,
    };
  });
}

/**
 * The frost-free stretch of the year by monthly normals: the first and last
 * month whose mean daily minimum is at least 5 °C. Null when no month is.
 * A first cut; the calendar (docs/plans, Part 2) refines it per crop.
 */
export function frostFreeMonths(months: ClimateMonth[]): { from: number; to: number } | null {
  const ok = months.filter((m) => m.minC !== null && !m.frostRisk).map((m) => m.month);
  return ok.length ? { from: ok[0], to: ok[ok.length - 1] } : null;
}

/** The Portal for the environment this site runs in (same rule as the Portal's getAppUrl). */
export function portalUrl(environment: string | null | undefined): string {
  if (environment === "main" || environment === "prod") return "https://portal.digitalhome.cloud";
  if (environment === "sandbox" || !environment) return "http://localhost:8000";
  return "https://stage-portal.digitalhome.cloud";
}
