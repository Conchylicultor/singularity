import { describe, expect, test } from "bun:test";
import type { Block } from "@plugins/page/plugins/editor/core";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { PLACE_PIN_TYPE, placeOverlays, placePinKind } from "./place-layer";

function block(id: string, type: string, data: unknown): Block {
  const at = new Date("2026-01-01T00:00:00.000Z");
  return {
    id,
    pageId: "p1",
    parentId: "p1",
    type,
    data,
    rank: Rank.from("a0"),
    expanded: true,
    createdAt: at,
    updatedAt: at,
  };
}

const eiffel = {
  providerId: "google",
  placeId: "g1",
  name: "Eiffel Tower",
  address: "Champ de Mars, Paris",
  lat: 48.8584,
  lng: 2.2945,
};

describe("placeOverlays", () => {
  test("a located place becomes a pin pointing back at its block", () => {
    expect(placeOverlays([block("b1", "place", eiffel)])).toEqual({
      overlays: [
        {
          overlay: {
            kind: "pin",
            id: "b1",
            pinType: PLACE_PIN_TYPE,
            position: { lat: 48.8584, lng: 2.2945 },
            label: "Eiffel Tower",
            data: { kind: undefined },
          },
          blockId: "b1",
        },
      ],
      unplaced: 0,
    });
  });

  test("the pin carries the place's kind, read back by placePinKind", () => {
    const [entry] = placeOverlays([
      block("b1", "place", { ...eiffel, kind: "attraction" }),
    ]).overlays;
    expect(entry?.overlay.kind).toBe("pin");
    if (entry?.overlay.kind !== "pin") return;
    expect(placePinKind(entry.overlay)).toBe("attraction");
  });

  test("placePinKind refuses a pin it did not make", () => {
    expect(() =>
      placePinKind({
        kind: "pin",
        id: "x",
        pinType: PLACE_PIN_TYPE,
        position: { lat: 0, lng: 0 },
        data: { kind: "volcano" },
      }),
    ).toThrow();
  });

  test("a picked place without coordinates is counted, not drawn", () => {
    const { lat: _lat, lng: _lng, ...noCoords } = eiffel;
    const resolving = { providerId: "google", placeId: "g2" };
    const result = placeOverlays([
      block("b1", "place", noCoords),
      block("b2", "place", resolving),
    ]);
    expect(result.overlays).toEqual([]);
    expect(result.unplaced).toBe(2);
  });

  test("an empty place block is not a place yet", () => {
    expect(placeOverlays([block("b1", "place", {})])).toEqual({
      overlays: [],
      unplaced: 0,
    });
  });

  test("ignores other block types and data that does not parse", () => {
    const result = placeOverlays([
      block("t", "text", { text: "hi", lat: 1, lng: 2 }),
      block("bad", "place", { placeId: 42, lat: "north" }),
    ]);
    expect(result).toEqual({ overlays: [], unplaced: 0 });
  });
});
