/**
 * Tests for the `no-adhoc-surface` lint rule. Run with `bun test` from the repo
 * root (or this file's directory).
 *
 * The rule fingerprints two open-coded surface recipes on intrinsic
 * span/div/button/a tags: `raised` (rounded + border + bg-card + padding — the
 * former no-adhoc-card) and `overlay` (bg-popover + shadow + rounded). It does
 * NOT lint `base` (bg-background) or `sunken` (bg-muted), which are ambiguous,
 * and skips capitalized component tags (`<Surface>`/`<Card>`/`<PopoverContent>`).
 */

import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "./no-adhoc-surface";

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
  "no-adhoc-surface",
  // The eslint flat-config RuleTester is typed against the legacy Rule shape;
  // the typescript-eslint createRule object is compatible at runtime.
  rule as unknown as Parameters<RuleTester["run"]>[1],
  {
    valid: [
      // Routed through the primitives (capitalized host tag — skipped).
      `const a = <Surface level="raised" className="p-3" />;`,
      `const a = <Card className="rounded-md border bg-card p-3" />;`,
      `const a = <PopoverContent className="bg-popover rounded-lg shadow-md p-md" />;`,
      // Raised escape: the named p-card padding token.
      `const a = <div className="rounded-md border bg-card p-card" />;`,
      // Not a contained surface: bg-card without the full raised fingerprint.
      `const a = <div className="bg-card p-3" />;`,
      // `p-none` (zero padding) is NOT card padding — excluded from the ramp.
      `const a = <div className="rounded-md border bg-card p-none" />;`,
      // Layout components (Stack/SortableItem) are skipped by the host-tag gate,
      // even when a surface recipe is smuggled through their className. Known
      // limitation: route these through <Surface> / SURFACE_LEVELS instead.
      `const a = <Stack className="rounded-md border bg-card p-lg" />;`,
      // base / sunken are NOT linted — bg-background / bg-muted are ambiguous.
      `const a = <div className="bg-background rounded-md border p-3 shadow-sm" />;`,
      `const a = <div className="bg-muted rounded-md border p-3" />;`,
      // overlay needs all of bg-popover + shadow + rounded.
      `const a = <div className="bg-popover rounded-md p-xs" />;`,
      // The shared map is read off a member expression, not a string literal.
      `const a = <div className={cn(SURFACE_LEVELS.overlay, "z-popover p-md")} />;`,
    ],
    invalid: [
      // raised fingerprint (former no-adhoc-card).
      {
        code: `const a = <div className="rounded-md border bg-card p-3" />;`,
        errors: [{ messageId: "adhocRaised" }],
      },
      // raised across split cn() fragments.
      {
        code: `const a = <div className={cn("rounded-md border", "bg-card", "p-2")} />;`,
        errors: [{ messageId: "adhocRaised" }],
      },
      // raised with named-ramp padding (`p-lg`) — the word-valued spacing utility
      // is real card padding and must complete the fingerprint.
      {
        code: `const a = <div className="rounded-lg border bg-card p-lg" />;`,
        errors: [{ messageId: "adhocRaised" }],
      },
      // raised on a semantic block container (`<section>`) — the section-as-card
      // escape hatch is now closed.
      {
        code: `const a = <section className="rounded-lg border border-border bg-card p-lg" />;`,
        errors: [{ messageId: "adhocRaised" }],
      },
      // overlay fingerprint.
      {
        code: `const a = <div className="bg-popover rounded-lg shadow-md p-xs" />;`,
        errors: [{ messageId: "adhocOverlay" }],
      },
      {
        code: `const a = <div className="rounded-xl border bg-popover text-popover-foreground shadow-2xl" />;`,
        errors: [{ messageId: "adhocOverlay" }],
      },
    ],
  },
);
