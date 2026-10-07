import { describe, expect, test } from "bun:test";
import { placePaletteGroup, placeTokenFill } from "./group";

describe("place palette", () => {
  test("a token paints as its CSS variable", () => {
    expect(placeTokenFill("place-shopping")).toBe("var(--place-shopping)");
  });

  test("defaults are Google Maps' pin colours", () => {
    expect(placePaletteGroup.schema["place-shopping"].default).toBe("#0497FF");
    expect(placePaletteGroup.schema["place-food"].default).toBe("#FF8127");
    expect(placePaletteGroup.schema["place-nature"].default).toBe("#178038");
  });
});
