/**
 * The package's only entry point.
 *
 * packages/site imports from "@dlab5/permtek5-core", never from a deep path into
 * dist/. Keeping one barrel means the internal file layout can change without
 * touching the site, and it is the list to read to see what this package is.
 */
export {
  mintId,
  isMintedId,
  mintTenantId,
  mintSpaceId,
  TENANT_ID_PREFIX,
  SPACE_ID_PREFIX,
} from "./identity.js";

export {
  ADMIN_GROUP,
  SPACE_ID,
  TENANT_ID,
  isMember,
  objectKeyForSpace,
  spacesOf,
  tenantCode,
  tenantsOf,
} from "./types.js";
export type { DeviceCodeInfo, EdgeSummary, Space, Tenant } from "./types.js";

export { assertSpace, isSpace, spaceProblems } from "./validate.js";

export { areaOfHomeId, climateMonths, frostFreeMonths, goldPath, portalUrl } from "./habitat.js";
export type { ClimateMonth, GoldClimate, GoldSolar, GoldWind, GoldWindow } from "./habitat.js";

export { CROP_IRI, cropById, cropName, crops, isWoody, monthSpan } from "./library.js";
export type { Activity, CropNeeds, LibraryCrop, TypicalWindow } from "./library.js";
export { FROST_RISK_MIN_C, activitiesIn, deriveWindows } from "./calendar.js";
export type { CropCalendar } from "./calendar.js";
export {
  CELL_STATUSES, EXPOSURES, HABITAT_IRI, ZONE_KINDS,
  bedGrid, checkHabitat, defaultOffset, emptyHabitat, footprint, newId, sowingJob, zoneOffset,
} from "./habitatModel.js";
export type { Bed, Cell, CellStatus, Exposure, GardenPlant, Habitat, Problem, SowingJob, Zone, ZoneKind } from "./habitatModel.js";
export { habitatFromTtl, habitatToTtl } from "./habitatGraph.js";
export { whatNow } from "./now.js";
export type { NowItem } from "./now.js";
export { CITYDEMO_TTL } from "./example.generated.js";
