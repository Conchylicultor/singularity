/**
 * The mint-driven pin on the bare-task-id pattern.
 *
 * Every fixture is a REAL `newTaskId()`, never a hand-typed literal — see
 * `attempt/core/pattern.test.ts` for why (a literal keeps passing exactly when
 * the pattern has stopped matching what the mint hands out).
 *
 * This is the one in-scope chip whose suffix is VARIABLE-length
 * (`[a-z0-9]{4,8}`), which is the shape `page-link`'s docblock warns about: a
 * greedy variable-length group can BACKTRACK to a shorter match in order to
 * satisfy a trailing boundary guard, and then linkifies a path segment as an
 * id. It does not happen here, and the tests below pin exactly why — so a
 * future widening of the pattern (or a change to `inlineBoundary`) fails loudly
 * instead of turning every `task-…/subpath` in a sentence into a chip.
 */

import { describe, expect, test } from "bun:test";
import { newTaskId } from "@plugins/tasks/plugins/tasks-core/core";
import { TASK_ID_RE } from "./pattern";

/** `TASK_ID_RE` carries the `g` flag, so every read gets a fresh matcher. */
const matches = (text: string): RegExpExecArray[] => [
  ...text.matchAll(new RegExp(TASK_ID_RE)),
];

const firstMatch = (text: string): string | undefined => matches(text)[0]?.[0];

describe("TASK_ID_RE", () => {
  test("matches a REAL minted id, whole", () => {
    const id = newTaskId();
    expect(firstMatch(id)).toBe(id);
  });

  test("picks a minted id out of surrounding prose", () => {
    const id = newTaskId();
    expect(firstMatch(`see ${id} here`)).toBe(id);
  });

  test("every id in a paragraph is found, in order", () => {
    const a = newTaskId();
    const b = newTaskId();
    expect(matches(`${a} blocks ${b}`).map((m) => m[0])).toEqual([a, b]);
  });

  test("the longest allowed suffix still matches whole", () => {
    // The mint slices six chars; the pattern allows up to eight, and the upper
    // bound has to keep working or a longer future mint stops chipping.
    const id = `${newTaskId()}ab`;
    expect(firstMatch(id)).toBe(id);
  });

  /**
   * THE backtracking case, and why it holds.
   *
   * `[a-z0-9]{4,8}` is greedy and the id's suffix is six chars, so the engine
   * first matches all six, hits `(?![/.])` against the `/`, and fails. It then
   * backtracks to five, to four — and every one of those shorter matches ends
   * BETWEEN TWO WORD CHARACTERS, where `inlineBoundary`'s trailing `\b` finds
   * no boundary. So no truncation can satisfy the guard and the whole scan
   * yields nothing, which is the correct answer for a path segment.
   *
   * The `\b` is therefore load-bearing, not decoration: drop it (or replace it
   * with something that ignores what follows the match) and `task-…/subpath`
   * starts chipping a truncated, non-existent id. This test is what makes that
   * change fail.
   */
  test("a variable-length suffix cannot backtrack into a path segment", () => {
    const id = newTaskId();
    expect(matches(`${id}/subpath`)).toEqual([]);
    expect(matches(`${id}.ts`)).toEqual([]);
    expect(matches(`/${id}`)).toEqual([]);
    expect(matches(`https://x.dev/${id}`)).toEqual([]);
  });

  test("a suffix longer than the allowed eight is not an id", () => {
    // Same mechanism as above, at the other end: the greedy `{4,8}` cannot
    // consume the ninth character, and no truncation lands on a word boundary.
    expect(firstMatch(`${newTaskId()}abc`)).toBeUndefined();
  });

  test("`task-` with no id after it is not a match", () => {
    expect(firstMatch("the task- prefix alone")).toBeUndefined();
    expect(firstMatch("task-list is a plugin")).toBeUndefined();
    expect(firstMatch("task-1755000000")).toBeUndefined();
    expect(firstMatch("task-1755000000-ab1")).toBeUndefined();
  });
});
