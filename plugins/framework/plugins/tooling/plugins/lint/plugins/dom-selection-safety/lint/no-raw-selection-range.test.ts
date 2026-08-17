/**
 * Tests for the `no-raw-selection-range` lint rule. Run with `bun test`.
 *
 * The rule bans `<x>.getRangeAt(...)` outside the dom-selection primitive —
 * the one selection read carrying a three-part guard. Everything else about a
 * selection stays valid: reading it (`.toString()`, `.anchorNode`), writing it
 * (`.removeAllRanges()`, `.addRange(...)`), and constructing your own Range
 * (`document.createRange()`) all need no guard, so none of them is flagged.
 */

import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "./no-raw-selection-range";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  },
});

// `RuleTester.run` drives the harness itself (it calls the ambient describe/it
// that bun:test provides), so it must run at module top level.
ruleTester.run(
  "no-raw-selection-range",
  // The eslint flat-config RuleTester is typed against the legacy Rule shape;
  // the typescript-eslint createRule object is compatible at runtime.
  rule as unknown as Parameters<RuleTester["run"]>[1],
  {
    valid: [
      // Bare `getSelection()` is untouched — reading the selection's text needs
      // no guard.
      { code: `const text = window.getSelection()?.toString() ?? "";` },
      // Selection WRITES are untouched.
      { code: `sel.removeAllRanges();` },
      // `addRange` is the write `diff-view` legitimately performs after
      // rebuilding a range for the copy handler.
      { code: `sel.addRange(range);` },
      // Constructing your own Range is a different operation entirely — this is
      // exactly what `caret-geometry`'s `nodeLineRect` does.
      { code: `const range = document.createRange();` },
      // The other collapsed-selection reads carry no guard obligation either.
      { code: `if (sel.isCollapsed && sel.anchorNode) return sel.anchorNode;` },
    ],
    invalid: [
      // The plain guarded-read-that-isn't.
      {
        code: `const range = sel.getRangeAt(0);`,
        errors: [{ messageId: "rawSelectionRange" }],
      },
      // The chained one-liner: no null check, no `rangeCount` check, and the
      // throw is uncaught.
      {
        code: `const rect = window.getSelection().getRangeAt(0).getBoundingClientRect();`,
        errors: [{ messageId: "rawSelectionRange" }],
      },
    ],
  },
);
