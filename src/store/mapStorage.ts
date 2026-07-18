/** Persistence for the authored board map (localStorage), v2 format. */
import {
  DEFAULT_TOWER_RADIUS,
  emptyLinks,
  type AuthoredMap,
  type AuthoredSeed,
  type DrawnRegion,
  type MapLinks,
} from "../engine";

const MAP_KEY = "darktower.map.v1";

export function saveMap(map: AuthoredMap): void {
  try {
    localStorage.setItem(MAP_KEY, JSON.stringify({ version: 2, ...map }));
  } catch {
    /* ignore */
  }
}

export function loadMap(): AuthoredMap | null {
  try {
    const raw = localStorage.getItem(MAP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    // v1: a bare array of seeds (no ids, no links, no tower size). Migrate.
    if (Array.isArray(parsed)) {
      if (!parsed.length) return null;
      const seeds: AuthoredSeed[] = parsed.map((s: any, i: number) => ({
        id: String(s.id ?? `m${i}`),
        kingdom: s.kingdom,
        type: s.type,
        cx: Number(s.cx),
        cy: Number(s.cy),
      }));
      return { towerRadius: DEFAULT_TOWER_RADIUS, seeds, links: emptyLinks() };
    }

    if (!parsed || !Array.isArray(parsed.seeds)) return null;
    const seeds: AuthoredSeed[] = parsed.seeds.map((s: any, i: number) => ({
      id: String(s.id ?? `m${i}`),
      kingdom: s.kingdom,
      type: s.type,
      cx: Number(s.cx),
      cy: Number(s.cy),
    }));
    let regions: DrawnRegion[] | undefined;
    if (Array.isArray(parsed.regions)) {
      regions = (parsed.regions as any[])
        .filter(
          (r) =>
            r &&
            typeof r.id === "string" &&
            r.kingdom &&
            r.type &&
            Array.isArray(r.polygon) &&
            r.polygon.length >= 3
        )
        .map((r) => ({
          id: String(r.id),
          kingdom: r.kingdom,
          type: r.type,
          polygon: r.polygon.map((p: any) => [Number(p[0]), Number(p[1])] as [number, number]),
        }));
      if (!regions.length) regions = undefined;
    }
    const ids = new Set([...seeds.map((s) => s.id), ...(regions ?? []).map((r) => r.id)]);
    const validPair = (p: any): p is [string, string] =>
      Array.isArray(p) &&
      p.length === 2 &&
      p.every(
        (x: any) => typeof x === "string" && (ids.has(x) || x.startsWith("frontier-"))
      );
    const links: MapLinks = {
      add: (parsed.links?.add ?? []).filter(validPair),
      remove: (parsed.links?.remove ?? []).filter(validPair),
    };
    const towerRadius = Number(parsed.towerRadius) || DEFAULT_TOWER_RADIUS;
    const map: AuthoredMap = { towerRadius, seeds, links };
    if (regions) map.regions = regions;
    if (Number.isFinite(Number(parsed.frontierWidth))) {
      map.frontierWidth = Number(parsed.frontierWidth);
    }
    if (Number.isFinite(Number(parsed.frontierRotation))) {
      map.frontierRotation = Number(parsed.frontierRotation);
    }
    return map;
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
