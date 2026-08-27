/**
 * The mint-driven pin on the bare-conversation-id pattern.
 *
 * Every fixture is a REAL `newConversationId()`, never a hand-typed literal —
 * see `attempt/core/pattern.test.ts` for why a literal is worse than no test at
 * all here (it keeps passing exactly when the pattern has stopped matching what
 * the mint hands out).
 */

import { describe, expect, test } from "bun:test";
import { newConversationId } from "@plugins/tasks/plugins/tasks-core/core";
import { CONV_ID_RE } from "./pattern";

/** `CONV_ID_RE` carries the `g` flag, so every read gets a fresh matcher. */
const matches = (text: string): RegExpExecArray[] => [
  ...text.matchAll(new RegExp(CONV_ID_RE)),
];

const firstMatch = (text: string): string | undefined => matches(text)[0]?.[0];

describe("CONV_ID_RE", () => {
  test("matches a REAL minted id, whole", () => {
    const id = newConversationId();
    expect(firstMatch(id)).toBe(id);
  });

  test("picks a minted id out of surrounding prose", () => {
    const id = newConversationId();
    expect(firstMatch(`see ${id} for the earlier turn`)).toBe(id);
  });

  test("every id in a paragraph is found, in order", () => {
    const a = newConversationId();
    const b = newConversationId();
    expect(matches(`${a}, then ${b}`).map((m) => m[0])).toEqual([a, b]);
  });

  test("a path-like or dotted context is not an id reference", () => {
    const id = newConversationId();
    // The inlineBoundary guards: a leading `/`, or a trailing `/` or `.`.
    expect(firstMatch(`${id}/turns`)).toBeUndefined();
    expect(firstMatch(`${id}.jsonl`)).toBeUndefined();
    expect(firstMatch(`/${id}`)).toBeUndefined();
  });

  test("an id inside a URL path is not an id reference", () => {
    expect(firstMatch(`https://x.dev/${newConversationId()}`)).toBeUndefined();
  });

  test("a suffix longer than the minted four chars is not an id", () => {
    // Refused by `inlineBoundary`'s trailing `\b`: the fixed `{4}` suffix ends
    // the match between two word characters, where there is no boundary.
    expect(firstMatch(`${newConversationId()}e`)).toBeUndefined();
  });

  test("`conv-` with no id after it is not a match", () => {
    expect(firstMatch("the conv- prefix alone")).toBeUndefined();
    expect(firstMatch("conv-ersation is a word")).toBeUndefined();
    expect(firstMatch("conv-1783448623")).toBeUndefined();
    expect(firstMatch("conv-1783448623-h42")).toBeUndefined();
  });
});
