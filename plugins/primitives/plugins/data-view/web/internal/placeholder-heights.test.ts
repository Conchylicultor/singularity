import { describe, expect, it } from "bun:test";
import {
  placeholderHeights,
  type PagedReadLayout,
} from "./placeholder-heights";

const ID = "flat";
const read = (
  keys: string[],
  placeholders: Record<string, number> = {},
): PagedReadLayout => ({
  id: ID,
  keys,
  placeholders: Object.entries(placeholders).map(([key, rows]) => ({
    key,
    rows,
  })),
});
const px = (m: Map<string, { px: number }>) =>
  Object.fromEntries([...m].map(([k, v]) => [k, v.px]));

describe("placeholderHeights", () => {
  it("a placeholder replacing released rows takes their advances — exactly the room they took", () => {
    const prev = read(["a", "b", "c", "d"]);
    const next = read(["P", "c", "d"], { P: 2 });
    const advances = new Map([
      ["a", 31.5],
      ["b", 40],
      ["c", 31],
    ]);
    expect(
      px(placeholderHeights([prev], new Map(), [next], advances, 20)),
    ).toEqual({
      P: 71.5,
    });
  });

  it("keeps a standing placeholder's height whatever the pitch does since", () => {
    const prev = read(["P", "c"], { P: 2 });
    const sized = new Map([["P", { px: 71.5, rows: 2 }]]);
    const next = read(["P", "c", "d"], { P: 2 });
    expect(
      px(placeholderHeights([prev], sized, [next], new Map(), 99)),
    ).toEqual({
      P: 71.5,
    });
  });

  it("several placeholders between the same neighbours share the span row for row; rows never measured count at the pitch", () => {
    const prev = read(["Q", "a", "b", "c", "d"], { Q: 5 });
    const sized = new Map([["Q", { px: 150, rows: 5 }]]);
    const next = read(["Q", "P1", "P2", "d"], { Q: 5, P1: 1, P2: 2 });
    const advances = new Map([["a", 50]]);
    expect(px(placeholderHeights([prev], sized, [next], advances, 20))).toEqual(
      {
        Q: 150,
        P1: 50,
        P2: 40,
      },
    );
  });

  it("counts that do not match the span split it in proportion to rows", () => {
    const prev = read(["a", "b", "c"]);
    const next = read(["P1", "P2", "c"], { P1: 1, P2: 3 });
    const advances = new Map([
      ["a", 30],
      ["b", 50],
    ]);
    expect(
      px(placeholderHeights([prev], new Map(), [next], advances, 20)),
    ).toEqual({
      P1: 20,
      P2: 60,
    });
  });

  it("a placeholder with nothing it replaced (a page never drawn, a read with no layout before) is its rows at the pitch", () => {
    const prev = read(["a", "b"]);
    const next = read(["a", "b", "Z"], { Z: 3 });
    expect(
      px(
        placeholderHeights([prev], new Map(), [next], new Map([["b", 40]]), 25),
      ),
    ).toEqual({ Z: 75 });
    expect(
      px(placeholderHeights([], new Map(), [next], new Map(), null)),
    ).toEqual({
      Z: 96,
    });
  });

  it("rows that moved rather than left are no replacement: the pitch", () => {
    const prev = read(["a", "b", "c"]);
    const next = read(["P", "c", "a"], { P: 2 });
    expect(
      px(
        placeholderHeights([prev], new Map(), [next], new Map([["a", 90]]), 10),
      ),
    ).toEqual({ P: 20 });
  });
});
