/**
 * The mint-driven pin on the bare-attempt-id pattern.
 *
 * Every fixture is a REAL `newAttemptId()`, never a hand-typed literal. This
 * pattern re-types a shape whose one true declaration is the mint, so the two
 * are independent statements of one format: change the mint and the chips
 * silently stop matching, with nothing failing. That has already happened once
 * in this repo (the retired `block-\d+-[a-z0-9]{4,8}` shape — see
 * `page-link/web/internal/pattern.ts`), which is why hand-written literals are
 * banned here: a literal keeps passing precisely when the pattern has gone
 * wrong.
 */

import { describe, expect, test } from "bun:test";
import { newAttemptId } from "@plugins/tasks/plugins/tasks-core/core";
import { ATTEMPT_ID_RE } from "./pattern";

/** `ATTEMPT_ID_RE` carries the `g` flag, so every read gets a fresh matcher. */
const matches = (text: string): RegExpExecArray[] => [
  ...text.matchAll(new RegExp(ATTEMPT_ID_RE)),
];

const firstMatch = (text: string): string | undefined => matches(text)[0]?.[0];

describe("ATTEMPT_ID_RE", () => {
  test("matches a REAL minted id, whole", () => {
    const id = newAttemptId();
    expect(firstMatch(id)).toBe(id);
  });

  test("picks a minted id out of surrounding prose", () => {
    const id = newAttemptId();
    expect(firstMatch(`the agent is on ${id} right now`)).toBe(id);
  });

  test("every id in a paragraph is found, in order", () => {
    const a = newAttemptId();
    const b = newAttemptId();
    expect(matches(`${a} handed off to ${b}`).map((m) => m[0])).toEqual([a, b]);
  });

  test("a path-like or dotted context is not an id reference", () => {
    const id = newAttemptId();
    // The inlineBoundary guards: a leading `/`, or a trailing `/` or `.`.
    expect(firstMatch(`${id}/logs`)).toBeUndefined();
    expect(firstMatch(`${id}.ts`)).toBeUndefined();
    expect(firstMatch(`/${id}`)).toBeUndefined();
  });

  test("an id inside a URL path is not an id reference", () => {
    // The leading `(?<!\/)` is what keeps a worktree URL out of the chips: the
    // id is a legitimate path segment there, not a mention of the attempt.
    expect(firstMatch(`https://x.dev/${newAttemptId()}`)).toBeUndefined();
  });

  test("a suffix longer than the minted four chars is not an id", () => {
    // `inlineBoundary`'s trailing `\b` is what refuses this: the suffix is a
    // fixed `{4}`, so the extra character leaves the match ending between two
    // word characters — where there is no word boundary to satisfy.
    expect(firstMatch(`${newAttemptId()}e`)).toBeUndefined();
  });

  test("`att-` with no id after it is not a match", () => {
    expect(firstMatch("the att- prefix alone")).toBeUndefined();
    expect(firstMatch("att-tempting is not an id")).toBeUndefined();
    expect(firstMatch("att-1787654245")).toBeUndefined();
    expect(firstMatch("att-1787654245-y41")).toBeUndefined();
  });
});
