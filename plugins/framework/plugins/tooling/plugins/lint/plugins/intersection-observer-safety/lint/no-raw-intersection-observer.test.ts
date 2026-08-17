/**
 * Tests for the `no-raw-intersection-observer` lint rule. Run with `bun test`.
 *
 * The rule bans `new IntersectionObserver(...)` outside the in-view primitive.
 * Assigning a class to `globalThis.IntersectionObserver` (the bun-runtime stub)
 * and unrelated constructors stay valid — only the construction is flagged.
 */

import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "./no-raw-intersection-observer";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  },
});

// `RuleTester.run` drives the harness itself (it calls the ambient describe/it
// that bun:test provides), so it must run at module top level.
ruleTester.run(
  "no-raw-intersection-observer",
  // The eslint flat-config RuleTester is typed against the legacy Rule shape;
  // the typescript-eslint createRule object is compatible at runtime.
  rule as unknown as Parameters<RuleTester["run"]>[1],
  {
    valid: [
      // Assigning a stub class to the global is not a construction.
      {
        code: `globalThis.IntersectionObserver = class { observe() {} };`,
      },
      // Naming the type is not a construction.
      {
        code: `function f(entries: IntersectionObserverEntry[]) { return entries; }`,
      },
      // A different observer — this rule owns only IntersectionObserver.
      { code: `const o = new MutationObserver(() => {});` },
    ],
    invalid: [
      // The plain construction.
      {
        code: `const o = new IntersectionObserver(() => {});`,
        errors: [{ messageId: "rawIntersectionObserver" }],
      },
      // With options, still the same construction.
      {
        code: `const o = new IntersectionObserver(cb, { rootMargin: "0px 0px -66% 0px" });`,
        errors: [{ messageId: "rawIntersectionObserver" }],
      },
    ],
  },
);
