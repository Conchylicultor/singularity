import { describe, expect, test } from "bun:test";
import { placeBlock } from "./place-block";
import type { PlaceData } from "./schemas";

const tag = placeBlock.markdown!.tag!;
type SerializeCtx = Parameters<NonNullable<typeof tag.attrs>>[1];
type ParseCtx = Parameters<NonNullable<typeof tag.parseAttrs>>[1];
const serializeCtx: SerializeCtx = {
  md: (t) => String(t),
  mdLine: (t) => String(t),
  protectedSpans: [],
  plain: (t) => String(t),
  ordinal: 0,
};
const parseCtx: ParseCtx = { runs: () => [], protectedSpans: [] };

/** Serialize → parse, keeping only the attributes that were set (as the markdown writer does). */
function roundTrip(data: PlaceData): PlaceData {
  const attrs = Object.fromEntries(
    Object.entries(tag.attrs!(data, serializeCtx))
      .filter(([, v]) => v !== undefined && v !== null)
      .map(([k, v]) => [k, String(v)]),
  );
  return tag.parseAttrs!(attrs, parseCtx);
}

describe("place markdown tag", () => {
  test("the kind survives a round trip", () => {
    const data: PlaceData = {
      providerId: "google",
      placeId: "p1",
      name: "Café Kitsuné",
      address: "51 Galerie de Montpensier, Paris",
      category: "Coffee shop",
      kind: "cafe",
      fetchedAt: Date.parse("2026-09-29T12:00:00.000Z"),
    };
    expect(roundTrip(data)).toEqual(data);
  });

  test("a kind this build does not know reads as absent, not as an error", () => {
    const parsed = tag.parseAttrs!(
      { name: "Somewhere", address: "Paris", kind: "spaceport" },
      parseCtx,
    );
    expect(parsed.kind).toBeUndefined();
    expect(parsed.name).toBe("Somewhere");
  });
});
