/**
 * Headless Lexical round-trip tests for the runs↔Lexical converter.
 * Run with `bun test plugins/page/plugins/editor/web/internal/block-text-extensions.test.ts`.
 *
 * Lexical can run without a DOM via `createEditor` + `editorState.read/update`.
 * We don't exercise decorator (page-link) round-trip here — that needs the
 * extension registry wired at app bootstrap — only marks/color/link, which is
 * the new surface this phase adds.
 */

import { test, expect, describe } from "bun:test";
import { createEditor } from "lexical";
import { LinkNode } from "@lexical/link";
import type { RichText } from "../../core";
import { runsToLexical, serializeBlockRuns } from "./block-text-extensions";

function roundTrip(runs: RichText): RichText {
  const editor = createEditor({ namespace: "test", nodes: [LinkNode], onError: (e) => { throw e; } });
  editor.update(() => runsToLexical(runs), { discrete: true });
  return serializeBlockRuns(editor);
}

describe("runs↔Lexical round-trip", () => {
  test("plain text", () => {
    expect(roundTrip([{ text: "hello world" }])).toEqual([{ text: "hello world" }]);
  });

  test("single mark", () => {
    expect(roundTrip([{ text: "bold", marks: ["bold"] }])).toEqual([
      { text: "bold", marks: ["bold"] },
    ]);
  });

  test("multiple marks canonicalized", () => {
    const out = roundTrip([{ text: "x", marks: ["italic", "bold"] }]);
    expect(out).toEqual([{ text: "x", marks: ["bold", "italic"] }]);
  });

  test("color", () => {
    expect(roundTrip([{ text: "red", color: "red" }])).toEqual([
      { text: "red", color: "red" },
    ]);
  });

  test("link wraps its text", () => {
    expect(roundTrip([{ text: "click", link: "https://x" }])).toEqual([
      { text: "click", link: "https://x" },
    ]);
  });

  test("color + link + marks coexist on one run", () => {
    const run = {
      text: "fancy",
      marks: ["bold" as const],
      color: "green" as const,
      link: "https://x",
    };
    expect(roundTrip([run])).toEqual([run]);
  });

  test("mixed adjacent runs survive and stay distinct", () => {
    const runs: RichText = [
      { text: "a" },
      { text: "b", marks: ["bold"] },
      { text: "c", color: "blue" },
    ];
    expect(roundTrip(runs)).toEqual(runs);
  });

  test("empty runs → empty (single empty paragraph serializes to [])", () => {
    expect(roundTrip([])).toEqual([]);
  });
});
