/**
 * The mint-driven pin on the bare-prototype-id pattern.
 *
 * Every fixture is a REAL `newPrototypeId()`, never a hand-typed literal: this
 * pattern's whole job is to recognise what the mint hands out, so the day the
 * mint changes shape this must fail rather than the chips silently switching
 * off. `files/core/id.test.ts` pins the mint against the core regex; this pins
 * the boundary-wrapped reading of it, which is the one assistant prose meets.
 */

import { describe, expect, test } from "bun:test";
import { newPrototypeId } from "@plugins/apps/plugins/prototypes/plugins/files/core";
import { PROTOTYPES_DIR_DISPLAY } from "@plugins/infra/plugins/paths/plugins/display/core";
import { PROTOTYPE_INLINE_RE } from "./pattern";

/** `PROTOTYPE_INLINE_RE` carries the `g` flag, so every read gets a fresh matcher. */
const matches = (text: string): RegExpExecArray[] => [
  ...text.matchAll(new RegExp(PROTOTYPE_INLINE_RE)),
];

const firstMatch = (text: string): string | undefined => matches(text)[0]?.[0];

describe("PROTOTYPE_INLINE_RE", () => {
  test("matches a REAL minted id, whole", () => {
    const id = newPrototypeId();
    expect(firstMatch(id)).toBe(id);
  });

  test("picks a minted id out of surrounding prose", () => {
    const id = newPrototypeId();
    expect(firstMatch(`the mock is ${id} if you want a look`)).toBe(id);
  });

  test("every id in a paragraph is found, in order", () => {
    const a = newPrototypeId();
    const b = newPrototypeId();
    const c = newPrototypeId();
    expect(
      matches(`${a}, then ${b}, and finally ${c}`).map((m) => m[0]),
    ).toEqual([a, b, c]);
  });

  test("a path-like or dotted context is not an id reference", () => {
    const id = newPrototypeId();
    // The inlineBoundary guards: a leading `/`, or a trailing `/` or `.`.
    expect(firstMatch(`/${id}`)).toBeUndefined();
    expect(
      firstMatch(`${PROTOTYPES_DIR_DISPLAY}/${id}/index.html`),
    ).toBeUndefined();
    expect(firstMatch(`${id}/index.html`)).toBeUndefined();
    expect(firstMatch(`${id}.ts`)).toBeUndefined();
  });

  test("`proto-` with no id after it is not a match", () => {
    expect(firstMatch("the proto- prefix alone")).toBeUndefined();
    expect(firstMatch("proto-typing is not an id")).toBeUndefined();
    expect(firstMatch("proto-1786877040")).toBeUndefined();
  });

  test("a suffix that is not exactly four chars is not a minted id", () => {
    expect(firstMatch("proto-1786877040-w2v")).toBeUndefined();
    expect(firstMatch("proto-1786877040-w2vix")).toBeUndefined();
  });
});
