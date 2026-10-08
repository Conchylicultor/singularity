/**
 * The mint-driven pin on the three kinds' inline recognition — the readings the
 * `attempt` / `conv` / `task-link` chips render from.
 *
 * Every current-shape fixture is a REAL mint, never a hand-typed literal: a
 * literal keeps passing precisely when the recognition has stopped matching what
 * the mint hands out (the retired `block-\d+-[a-z0-9]{4,8}` shape went exactly
 * that way). The literals here are the LEGACY shapes live rows carry.
 */

import { describe, expect, test } from "bun:test";
import { inlineBoundary, type AnyIdKind } from "@plugins/ids/core";
import { attemptIdKind, conversationIdKind, taskIdKind } from "./id-kinds";

const matches = (kind: AnyIdKind, text: string) =>
  [...text.matchAll(inlineBoundary(kind.pattern))].map((m) => m[0]);

for (const kind of [taskIdKind, attemptIdKind, conversationIdKind]) {
  describe(`${kind.prefix} kind`, () => {
    test("a real mint matches whole, in prose", () => {
      const id = kind.mint();
      expect(kind.is(id)).toBe(true);
      expect(matches(kind, `see ${id} here`)).toEqual([id]);
    });

    test("every id in a paragraph is found, in order", () => {
      const a = kind.mint();
      const b = kind.mint();
      expect(matches(kind, `${a} then ${b}`)).toEqual([a, b]);
    });

    test("a path, URL or dotted suffix is not a mention", () => {
      const id = kind.mint();
      expect(matches(kind, `${id}/logs`)).toEqual([]);
      expect(matches(kind, `${id}.ts`)).toEqual([]);
      expect(matches(kind, `/${id}`)).toEqual([]);
      expect(matches(kind, `https://x.dev/${id}`)).toEqual([]);
    });

    test("an id ending a sentence still matches", () => {
      const id = kind.mint();
      expect(matches(kind, `filed as ${id}.`)).toEqual([id]);
    });

    test("the prefix alone, or a word starting with it, is not an id", () => {
      expect(matches(kind, `the ${kind.prefix}- prefix alone`)).toEqual([]);
      expect(matches(kind, `${kind.prefix}-list is a word`)).toEqual([]);
      expect(matches(kind, `${kind.prefix}-1755000000`)).toEqual([]);
      expect(matches(kind, `${kind.prefix}-1755000000-ab1`)).toEqual([]);
    });
  });
}

describe("legacy shapes stay recognised", () => {
  test("task: epoch millis + 6", () => {
    expect(taskIdKind.is("task-1776202379751-fyc7xh")).toBe(true);
  });

  test("att / conv: epoch seconds + 4, and the millis attempt form", () => {
    expect(attemptIdKind.is("att-1791408259-mh1u")).toBe(true);
    expect(attemptIdKind.is("att-1776292503536-adnjx6")).toBe(true);
    expect(conversationIdKind.is("conv-1791408259-14gw")).toBe(true);
  });

  test("the claude- alias, with and without a suffix", () => {
    for (const id of ["claude-1776085277", "claude-1777038135-r8rx"]) {
      expect(attemptIdKind.is(id)).toBe(true);
      expect(conversationIdKind.is(id)).toBe(true);
    }
  });

  test("hand-made names are not ids", () => {
    expect(taskIdKind.is("task-meta-crashes")).toBe(false);
    expect(attemptIdKind.is("legacy-claude-1776357357")).toBe(false);
  });
});
