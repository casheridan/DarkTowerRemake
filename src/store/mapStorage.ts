/** Persistence and JSON interchange for authored board maps (v2 format). */
import {
  DEFAULT_FRONTIER_WIDTH,
  DEFAULT_TOWER_RADIUS,
  MAX_FRONTIER_ROTATION,
  MAX_FRONTIER_WIDTH,
  MAX_TOWER_RADIUS,
  MIN_FRONTIER_WIDTH,
  MIN_TOWER_RADIUS,
  emptyLinks,
  type AuthoredMap,
  type AuthoredSeed,
  type DrawnRegion,
  type KingdomId,
  type MapLinks,
  type TerritoryType,
} from "../engine";

const MAP_KEY = "darktower.map.v1";
const MAP_VERSION = 2;
const KINGDOMS: readonly KingdomId[] = ["arisilon", "brynthia", "durnin", "zenon"];
const TERRITORY_TYPES: readonly TerritoryType[] = [
  "plain",
  "citadel",
  "bazaar",
  "sanctuary",
  "tomb",
  "ruin",
  "darkTower",
];
const FRONTIER_IDS = new Set(["frontier-0", "frontier-1", "frontier-2", "frontier-3"]);

type JsonObject = Record<string, unknown>;

/** A user-facing error caused by an incompatible or malformed map file. */
export class MapFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MapFormatError";
  }
}

function invalid(detail: string): never {
  throw new MapFormatError(`Invalid map file: ${detail}.`);
}

function asObject(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return invalid(`${label} must be an object`);
  }
  return value as JsonObject;
}

function asEnum<T extends string>(value: unknown, values: readonly T[], label: string): T {
  if (typeof value !== "string" || !values.includes(value as T)) {
    return invalid(`${label} is not recognized`);
  }
  return value as T;
}

function asNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return invalid(`${label} must be a finite number`);
  }
  return value;
}

function boundedNumber(
  value: unknown,
  fallback: number,
  min: number,
  max: number,
  label: string
): number {
  if (value === undefined) return fallback;
  return Math.max(min, Math.min(max, asNumber(value, label)));
}

function asId(value: unknown, fallback: string | null, label: string): string {
  const id = value === undefined && fallback ? fallback : value;
  if (typeof id !== "string" || !id.trim()) return invalid(`${label} must be a non-empty string`);
  if (id === "tower" || id.startsWith("frontier-")) {
    return invalid(`${label} uses the reserved id "${id}"`);
  }
  return id;
}

function parseSeed(value: unknown, index: number): AuthoredSeed {
  const seed = asObject(value, `seeds[${index}]`);
  return {
    id: asId(seed.id, `m${index}`, `seeds[${index}].id`),
    kingdom: asEnum(seed.kingdom, KINGDOMS, `seeds[${index}].kingdom`),
    type: asEnum(seed.type, TERRITORY_TYPES, `seeds[${index}].type`),
    cx: asNumber(seed.cx, `seeds[${index}].cx`),
    cy: asNumber(seed.cy, `seeds[${index}].cy`),
  };
}

function parseRegion(value: unknown, index: number): DrawnRegion {
  const region = asObject(value, `regions[${index}]`);
  if (!Array.isArray(region.polygon) || region.polygon.length < 3) {
    return invalid(`regions[${index}].polygon must contain at least 3 points`);
  }
  const polygon = region.polygon.map((value, pointIndex) => {
    if (!Array.isArray(value) || value.length < 2) {
      return invalid(`regions[${index}].polygon[${pointIndex}] must be an [x, y] point`);
    }
    return [
      asNumber(value[0], `regions[${index}].polygon[${pointIndex}][0]`),
      asNumber(value[1], `regions[${index}].polygon[${pointIndex}][1]`),
    ] as [number, number];
  });
  return {
    id: asId(region.id, null, `regions[${index}].id`),
    kingdom: asEnum(region.kingdom, KINGDOMS, `regions[${index}].kingdom`),
    type: asEnum(region.type, TERRITORY_TYPES, `regions[${index}].type`),
    polygon,
  };
}

function parseLinkList(value: unknown, label: string, validIds: Set<string>): [string, string][] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) return invalid(`${label} must be an array`);
  return value.map((pair, index) => {
    if (!Array.isArray(pair) || pair.length !== 2) {
      return invalid(`${label}[${index}] must contain exactly 2 territory ids`);
    }
    const [from, to] = pair;
    if (typeof from !== "string" || typeof to !== "string") {
      return invalid(`${label}[${index}] must contain string territory ids`);
    }
    if (!validIds.has(from) || !validIds.has(to)) {
      return invalid(`${label}[${index}] refers to a territory that is not in the map`);
    }
    if (from === to) return invalid(`${label}[${index}] cannot link a territory to itself`);
    return [from, to];
  });
}

/** Validate and migrate parsed JSON data into the current authored-map shape. */
export function parseMapData(value: unknown): AuthoredMap {
  // v1 maps were a bare array of seeds with no stable ids or map settings.
  if (Array.isArray(value)) {
    if (!value.length) return invalid("the legacy seed list is empty");
    return {
      towerRadius: DEFAULT_TOWER_RADIUS,
      seeds: value.map(parseSeed),
      links: emptyLinks(),
    };
  }

  const root = asObject(value, "the top-level value");
  if (root.version !== undefined && root.version !== MAP_VERSION) {
    return invalid(`map version ${String(root.version)} is not supported`);
  }
  if (!Array.isArray(root.seeds)) return invalid("seeds must be an array");

  const seeds = root.seeds.map(parseSeed);
  let regions: DrawnRegion[] | undefined;
  if (root.regions !== undefined) {
    if (!Array.isArray(root.regions)) return invalid("regions must be an array");
    const parsedRegions = root.regions.map(parseRegion);
    if (parsedRegions.length) regions = parsedRegions;
  }

  const allIds = [...seeds.map((seed) => seed.id), ...(regions ?? []).map((region) => region.id)];
  const uniqueIds = new Set(allIds);
  if (uniqueIds.size !== allIds.length) return invalid("territory ids must be unique");

  // Drawn regions take precedence over seeds in the board builder, so links may
  // only target whichever collection is active plus the permanent frontiers.
  const activeIds = new Set([
    ...(regions ?? seeds).map((territory) => territory.id),
    ...FRONTIER_IDS,
  ]);
  const rawLinks = root.links === undefined ? {} : asObject(root.links, "links");
  const links: MapLinks = {
    add: parseLinkList(rawLinks.add, "links.add", activeIds),
    remove: parseLinkList(rawLinks.remove, "links.remove", activeIds),
  };

  const map: AuthoredMap = {
    towerRadius: boundedNumber(
      root.towerRadius,
      DEFAULT_TOWER_RADIUS,
      MIN_TOWER_RADIUS,
      MAX_TOWER_RADIUS,
      "towerRadius"
    ),
    seeds,
    links,
  };
  if (regions) map.regions = regions;
  if (root.frontierWidth !== undefined) {
    map.frontierWidth = boundedNumber(
      root.frontierWidth,
      DEFAULT_FRONTIER_WIDTH,
      MIN_FRONTIER_WIDTH,
      MAX_FRONTIER_WIDTH,
      "frontierWidth"
    );
  }
  if (root.frontierRotation !== undefined) {
    map.frontierRotation = boundedNumber(
      root.frontierRotation,
      0,
      -MAX_FRONTIER_ROTATION,
      MAX_FRONTIER_ROTATION,
      "frontierRotation"
    );
  }
  return map;
}

/** Parse a JSON map file and return a validated, current-format map. */
export function parseMapJson(json: string): AuthoredMap {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new MapFormatError("The selected file is not valid JSON.");
  }
  return parseMapData(value);
}

/** Serialize a map in the same versioned format used by saved and exported maps. */
export function serializeMap(map: AuthoredMap, pretty = false): string {
  return JSON.stringify({ version: MAP_VERSION, ...map }, null, pretty ? 2 : undefined);
}

export function saveMap(map: AuthoredMap): void {
  try {
    localStorage.setItem(MAP_KEY, serializeMap(map));
  } catch {
    /* ignore */
  }
}

export function loadMap(): AuthoredMap | null {
  try {
    const raw = localStorage.getItem(MAP_KEY);
    return raw ? parseMapJson(raw) : null;
  } catch {
    return null;
  }
}

export function clearMap(): void {
  try {
    localStorage.removeItem(MAP_KEY);
  } catch {
    /* ignore */
  }
}

export function hasSavedMap(): boolean {
  return loadMap() !== null;
}
