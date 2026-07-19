import { describe, expect, it } from "vitest";
import type { AuthoredMap } from "../../engine";
import {
  MapFormatError,
  parseMapData,
  parseMapJson,
  serializeMap,
} from "../mapStorage";

describe("map JSON interchange", () => {
  it("round-trips a version 2 drawn map", () => {
    const map: AuthoredMap = {
      towerRadius: 94,
      frontierWidth: 3.5,
      frontierRotation: -1.5,
      seeds: [],
      regions: [
        {
          id: "region-a",
          kingdom: "arisilon",
          type: "bazaar",
          polygon: [
            [100, 100],
            [180, 100],
            [140, 170],
          ],
        },
      ],
      links: { add: [["region-a", "frontier-0"]], remove: [] },
    };

    const json = serializeMap(map, true);

    expect(JSON.parse(json).version).toBe(2);
    expect(parseMapJson(json)).toEqual(map);
  });

  it("migrates legacy seed arrays and supplies stable ids", () => {
    const map = parseMapData([
      { kingdom: "zenon", type: "plain", cx: 100, cy: 200 },
      { kingdom: "zenon", type: "citadel", cx: 120, cy: 220 },
    ]);

    expect(map.seeds.map((seed) => seed.id)).toEqual(["m0", "m1"]);
    expect(map.towerRadius).toBe(58);
    expect(map.links).toEqual({ add: [], remove: [] });
  });

  it("clamps imported map settings to editor limits", () => {
    const map = parseMapData({
      version: 2,
      towerRadius: 999,
      frontierWidth: 1,
      frontierRotation: -999,
      seeds: [],
      links: { add: [], remove: [] },
    });

    expect(map.towerRadius).toBe(140);
    expect(map.frontierWidth).toBe(3);
    expect(map.frontierRotation).toBe(-25);
  });

  it("rejects malformed JSON and unsupported versions with useful errors", () => {
    expect(() => parseMapJson("not json")).toThrowError(
      new MapFormatError("The selected file is not valid JSON.")
    );
    expect(() =>
      parseMapData({ version: 3, towerRadius: 58, seeds: [], links: {} })
    ).toThrow("map version 3 is not supported");
  });

  it("rejects invalid territories and stale links", () => {
    expect(() =>
      parseMapData({
        version: 2,
        seeds: [{ id: "bad", kingdom: "nowhere", type: "plain", cx: 1, cy: 2 }],
      })
    ).toThrow("seeds[0].kingdom is not recognized");

    expect(() =>
      parseMapData({
        version: 2,
        seeds: [{ id: "a", kingdom: "arisilon", type: "plain", cx: 1, cy: 2 }],
        links: { add: [["a", "missing"]], remove: [] },
      })
    ).toThrow("refers to a territory that is not in the map");
  });
});
