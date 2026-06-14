/**
 * Tests for the `no-adhoc-viewport-overlay` lint rule. Run with `bun test` from
 * the repo root (or this file's directory).
 *
 * The rule fingerprints the viewport-fill recipe (`fixed` + `inset-0`) on
 * intrinsic span/div/button/a tags and redirects it to `<ViewportOverlay>`. It
 * skips capitalized component tags, and only fires when BOTH `fixed` and
 * `inset-0` are present (pane-relative `absolute inset-0` and partial `fixed`
 * positioning are left alone).
 */

import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "./no-adhoc-viewport-overlay";

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

// `RuleTester.run` drives the harness itself (calls the ambient describe/it that
// bun:test provides), so it must run at module top level — never inside test().
ruleTester.run(
  "no-adhoc-viewport-overlay",
  // The eslint flat-config RuleTester is typed against the legacy Rule shape;
  // the typescript-eslint createRule object is compatible at runtime.
  rule as unknown as Parameters<RuleTester["run"]>[1],
  {
    valid: [
      // Routed through the primitive (capitalized host tag — skipped).
      `const a = <ViewportOverlay className="fixed inset-0 bg-black/30" />;`,
      // Pane-relative overlay: absolute, not fixed — the sanctioned alternative.
      `const a = <div className="absolute inset-0 z-overlay bg-background" />;`,
      // Positioned chrome that is not a full viewport fill (no inset-0).
      `const a = <div className="fixed top-2 right-3 z-popover" />;`,
      // inset-0 without fixed (e.g. an absolute fill) is fine.
      `const a = <div className="inset-0 absolute" />;`,
      // The recipe read off a member expression / helper — opaque to the walk.
      `const a = <div className={OVERLAY_ROOT} />;`,
    ],
    invalid: [
      // The bare viewport-fill recipe.
      {
        code: `const a = <div className="fixed inset-0 z-popover bg-black/30" />;`,
        errors: [{ messageId: "adhocViewportOverlay" }],
      },
      // Across split cn() fragments.
      {
        code: `const a = <div className={cn("fixed", "inset-0", "z-max")} />;`,
        errors: [{ messageId: "adhocViewportOverlay" }],
      },
      // Variant-prefixed tokens still resolve to the base class.
      {
        code: `const a = <div className="md:fixed md:inset-0" />;`,
        errors: [{ messageId: "adhocViewportOverlay" }],
      },
      // Other intrinsic host tags are covered too.
      {
        code: `const a = <button className="fixed inset-0" />;`,
        errors: [{ messageId: "adhocViewportOverlay" }],
      },
    ],
  },
);
