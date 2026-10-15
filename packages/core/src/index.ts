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
export type { Activity, CropMix, CropNeeds, LibraryCrop, TypicalWindow } from "./library.js";
export { FROST_RISK_MIN_C, activitiesIn, deriveWindows } from "./calendar.js";
export type { CropCalendar } from "./calendar.js";
export {
  CELL_STATUSES, EXPOSURES, GUILD_ROBOT, GUILD_TYPES, HABITAT_IRI, ROBOT_NAME, STORE_KINDS, SUBSTRATE_KINDS, VALVE_KINDS, WATER_KINDS, ZONE_KINDS,
  SURFACE_LIMITS, bedGrid, checkHabitat, defaultOffset, emptyHabitat, farmBeds, farmLayout, footprint, newFarm, newGuild, guildForBed, WORMBED5, newId, sowingJob, wormBinCols, zoneOffset,
} from "./habitatModel.js";
export type {
  Bed, BedFarm, Cell, CellStatus, Exposure, GardenPlant, Guild, GuildType, Habitat, Problem, RainCatchment, RobotModel, SowingJob, StoreKind, SubstrateKind,
  Valve, ValveKind, WaterKind, WaterStore, Zone, ZoneKind,
} from "./habitatModel.js";
export { WORMBED5_WATER, defaultWater, rainLitres, useMmPerDay, waterBudget } from "./water.js";
export type { WaterMonth } from "./water.js";
export { PHASES, VERDICTS, adoptStarter, checksDue, nextCycle, nextPhase, say, verdict } from "./learning.js";
export type { Check, Hypothesis, Lang, LearningCycle, Measure, Phase, StarterGuide, Texts, Verdict } from "./learning.js";
export { SIZING_GUIDE } from "./sizingGuide.generated.js";
export { habitatFromTtl, habitatToTtl } from "./habitatGraph.js";
export { whatNow } from "./now.js";
export { FEEDING_GUIDE } from "./feedingGuide.generated.js";
export { CARE_GUIDE } from "./careGuide.generated.js";
export { careDue, careInMonth, careRhythms } from "./maintenance.js";
export type { CareDue, CareGuide, CareReason, CareTask, CareWho } from "./maintenance.js";
export type { NowItem } from "./now.js";
export { CITYDEMO_TTL } from "./example.generated.js";
export {
  DEFAULT_DEPTH_CM, DEFAULT_SUBSTRATE, GANTRY_KG, LIGHT_ROOF_KG_M2, SATURATED_DENSITY, TERRACE_KG_M2, bedLoad, loadClass, sumpLitres,
} from "./bedLoad.js";
export type { BedLoad, LoadClass } from "./bedLoad.js";
export { cropsWanted, matchCrop, parseIngredients, recipeName, sharedRecipes } from "./recipes.js";
export type { Recipe, RecipeLine } from "./recipes.js";
export { crowdedCells, layerOf, planFarm, planFromSets, plantCounts, shareOut, plantingConflict, scorePlanting, suggestPlanting } from "./planting.js";
export type { Layer, Placement, PlantingOptions, PlantingScore, PlantingSuggestion, SetChoice, SetPlan } from "./planting.js";
export { PLANNED_SURFACES, plantSetById, plantSets, setName } from "./plantSets.js";
export type { PlantSet, SetMember, SurfaceCategory } from "./plantSets.js";
export { cropSeasons, givesWay, standingIn, yearPlan } from "./season.js";
export type { CropSeason, GoesIn, Planting, YearPlan } from "./season.js";
