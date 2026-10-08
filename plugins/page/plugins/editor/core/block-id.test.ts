/**
 * The mint-driven pin on the block id kind's inline recognition — the reading
 * the active-data `page-link` chip renders a bare `block-…` in assistant prose
 * from. Every current-shape fixture comes from the real mint, so the day the
 * mint changes this fails instead of the chip silently switching off (which is
 * exactly what the retired `block-\d+-[a-z0-9]{4,8}` chip shape did).
 */

import { describe, expect, test } from "bun:test";
import { inlineBoundary } from "@plugins/ids/core";
import { blockIdKind, newBlockId } from "./block-id";

const matches = (text: string): string[] =>
  [...text.matchAll(inlineBoundary(blockIdKind.pattern))].map((m) => m[0]);

describe("blockIdKind", () => {
  test("a real mint is recognised whole, in prose", () => {
    const id = newBlockId();
    expect(blockIdKind.is(id)).toBe(true);
    expect(matches(`see ${id} for the details`)).toEqual([id]);
  });

  test("the retired `block-<epochMillis>-<base36>` form still matches", () => {
    expect(matches("block-1785758168006-jdr04d")).toEqual([
      "block-1785758168006-jdr04d",
    ]);
  });

  test("every id in a paragraph is found, in order", () => {
    const a = newBlockId();
    const b = newBlockId();
    expect(matches(`${a} then ${b}`)).toEqual([a, b]);
  });

  test("a path-like or dotted context is not an id reference", () => {
    const id = newBlockId();
    expect(matches(`/${id}`)).toEqual([]);
    expect(matches(`${id}/web`)).toEqual([]);
    expect(matches(`${id}.ts`)).toEqual([]);
  });

  test("an id ending a sentence still matches", () => {
    const id = newBlockId();
    expect(matches(`the note is on ${id}.`)).toEqual([id]);
  });

  test("`block-` with no id after it is not a match", () => {
    expect(matches("the block- prefix alone")).toEqual([]);
    expect(matches("block-alpha")).toEqual([]);
    expect(matches("block-text-editor")).toEqual([]);
  });
});
