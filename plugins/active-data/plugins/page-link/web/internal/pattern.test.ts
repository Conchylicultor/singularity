/**
 * The mint-driven pin on the bare-block-id pattern.
 *
 * This pattern matches an id in free assistant prose, so it has no namespace to
 * key on and must parse the id's SHAPE — the one thing `newBlockId()` says
 * nothing may do. The guard against that is here: every fixture comes from the
 * real mint, so the day the mint changes this fails instead of the chip
 * silently switching off (which is exactly what the retired
 * `block-\d+-[a-z0-9]{4,8}` shape did).
 */

import { describe, expect, test } from "bun:test";
import { newBlockId } from "@plugins/page/plugins/editor/core";
import { BLOCK_ID_RE } from "./pattern";

/** `BLOCK_ID_RE` carries the `g` flag, so every read gets a fresh matcher. */
const matches = (text: string): RegExpExecArray[] => [
  ...text.matchAll(new RegExp(BLOCK_ID_RE)),
];

const firstMatch = (text: string): string | undefined => matches(text)[0]?.[0];

describe("BLOCK_ID_RE", () => {
  test("matches a REAL minted id, whole", () => {
    const id = newBlockId();
    expect(firstMatch(id)).toBe(id);
  });

  test("picks a minted id out of surrounding prose", () => {
    const id = newBlockId();
    expect(firstMatch(`see ${id} for the details`)).toBe(id);
  });

  test("the retired `block-<epochMillis>-<base36>` form still matches", () => {
    expect(firstMatch("block-1785758168006-jdr04d")).toBe(
      "block-1785758168006-jdr04d",
    );
  });

  test("every id in a paragraph is found, in order", () => {
    const a = newBlockId();
    const b = newBlockId();
    expect(matches(`${a} then ${b}`).map((m) => m[0])).toEqual([a, b]);
  });

  test("a path-like or dotted context is not an id reference", () => {
    const id = newBlockId();
    // The inlineBoundary guards: a leading `/` or a trailing `/`, `.`.
    expect(firstMatch(`/${id}`)).toBeUndefined();
    expect(firstMatch(`${id}/web`)).toBeUndefined();
    expect(firstMatch(`${id}.ts`)).toBeUndefined();
  });

  test("`block-` with no id after it is not a match", () => {
    expect(firstMatch("the block- prefix alone")).toBeUndefined();
    expect(firstMatch("block-alpha")).toBeUndefined();
  });
});
