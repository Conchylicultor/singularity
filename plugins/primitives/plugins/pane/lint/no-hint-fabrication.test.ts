/**
 * Tests for the `no-hint-fabrication` lint rule. Run with `bun test` from the
 * repo root (or this file's directory).
 *
 * The rule bans recovering a bare pane hint (`pick()` with no / undefined / null
 * canonical value) and defaulting a hint `pick()` to a fabricated value
 * (`?? "Untitled"`), but must NOT fire on `pick()` calls whose receiver is not a
 * Hint, nor on sanctioned fallbacks (`null` / `undefined` / a JSX placeholder).
 */

import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "./no-hint-fabrication";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    parserOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      ecmaFeatures: { jsx: true },
    },
  },
});

// `RuleTester.run` drives the test harness itself (it calls the ambient
// describe/it that bun:test provides), so it must run at module top level —
// never wrapped in a `test()` callback.
ruleTester.run(
  "no-hint-fabrication",
  // The eslint flat-config RuleTester is typed against the legacy Rule shape;
  // the typescript-eslint createRule object is compatible at runtime.
  rule as unknown as Parameters<RuleTester["run"]>[1],
  {
    valid: [
      // Canonical value supplied — the sanctioned observation.
      {
        code: `
          const h = p.useHint();
          const title = h.pick("title", canonical);
        `,
      },
      // Sanctioned fallbacks: null / undefined.
      {
        code: `
          const h = p.useHint();
          const a = h.pick("title", x) ?? null;
          const b = h.pick("title", x) ?? undefined;
        `,
      },
      // JSX placeholder fallback — a ReactNode can never be written back.
      {
        code: `
          const h = p.useHint();
          const label = h.pick("title", x) ?? <Placeholder>Untitled</Placeholder>;
        `,
      },
      // Bare use of a pick result is fine (no logical default).
      {
        code: `
          const h = p.useHint();
          const v = h.pick("title", x);
          return v;
        `,
      },
      // Hint-typed parameter, canonical supplied — no fabrication.
      {
        code: `
          function useSongTitle(p, hint: Hint<{ title: string }>) {
            return hint.pick("title", canonical);
          }
        `,
      },
      // `.pick` on a non-hint receiver (lodash) — never fires.
      {
        code: `
          const picked = lodash.pick(obj, "a");
        `,
      },
      // `.pick` on a binding whose initializer isn't `useHint()` — not a receiver.
      {
        code: `
          const x = foo();
          const y = x.pick("a", undefined);
        `,
      },
      // Logical default on something that isn't a pick result at all.
      {
        code: `
          const title = someOther ?? "Untitled";
        `,
      },
    ],
    invalid: [
      // Bare hint — canonical is a literal `undefined`.
      {
        code: `
          const h = p.useHint();
          const title = h.pick("title", undefined);
        `,
        errors: [{ messageId: "bareHint" }],
      },
      // Bare hint — canonical is `null`.
      {
        code: `
          const h = p.useHint();
          const title = h.pick("title", null);
        `,
        errors: [{ messageId: "bareHint" }],
      },
      // Bare hint — no canonical argument at all (arity < 2).
      {
        code: `
          const h = p.useHint();
          const title = h.pick("title");
        `,
        errors: [{ messageId: "bareHint" }],
      },
      // Fabrication — string default after a proper pick.
      {
        code: `
          const h = p.useHint();
          const title = h.pick("title", x) ?? "Untitled";
        `,
        errors: [{ messageId: "hintFabrication" }],
      },
      // Fabrication — `||` with a numeric default.
      {
        code: `
          const h = p.useHint();
          const count = h.pick("count", x) || 0;
        `,
        errors: [{ messageId: "hintFabrication" }],
      },
      // Fabrication — one-level const, later `?? "Untitled"`.
      {
        code: `
          const h = p.useHint();
          const v = h.pick("title", x);
          return v ?? "Untitled";
        `,
        errors: [{ messageId: "hintFabrication" }],
      },
      // Fabrication — receiver is a `Hint<…>`-annotated parameter.
      {
        code: `
          function useSongTitle(p, hint: Hint<{ title: string }>) {
            return hint.pick("title", x) ?? "Untitled";
          }
        `,
        errors: [{ messageId: "hintFabrication" }],
      },
      // Bare hint — direct inline `<x>.useHint().pick(...)` receiver.
      {
        code: `
          const title = p.useHint().pick("title", undefined);
        `,
        errors: [{ messageId: "bareHint" }],
      },
    ],
  },
);
