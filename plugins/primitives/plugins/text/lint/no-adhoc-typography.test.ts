/**
 * Tests for the `no-adhoc-typography` lint rule. Run with `bun test`:
 *
 *   bun test plugins/primitives/plugins/text/lint/no-adhoc-typography.test.ts
 *
 * The focus is the hardened class-token walk's MAPS-ONLY alias resolution: a
 * banned `text-*`/`leading-*` parked in an object/array-literal MAP indexed
 * directly in a class context (e.g. `cn(TONE[tone])`, `styles.title`) must be
 * flagged (the regression guard), while a bare string `const`, an intermediate-
 * local map indirection, doc-strings, sanctioned sub-scale classes, and param-
 * passed classNames (no in-file initializer) must NOT be.
 */

import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "./no-adhoc-typography";

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
  "no-adhoc-typography",
  // The eslint flat-config RuleTester is typed against the legacy Rule shape;
  // the typescript-eslint createRule object is compatible at runtime.
  rule as unknown as Parameters<RuleTester["run"]>[1],
  {
    valid: [
      // A doc string / unrelated literal not in any class-name context: the walk
      // never starts here, so `text-sm` in prose is never inspected.
      { code: `const note = "use text-sm instead of raw sizes";` },
      // Color + sanctioned sub-scale in a map that reaches className: harvested,
      // but neither `text-muted-foreground` (color) nor `text-2xs` (sub-scale)
      // is a banned named size.
      {
        code: `
          const M = { a: "text-muted-foreground text-2xs" };
          const C = () => <span className={cn(M.a)} />;
        `,
      },
      // A param-passed className has no in-file initializer to read, so the
      // alias resolution finds nothing to harvest.
      {
        code: `
          function C({ className }: { className?: string }) {
            return <div className={cn("flex", className)} />;
          }
        `,
      },
      // Maps-only: a bare string `const` alias is NOT followed. (Shared mono/code
      // metrics live in such consts and are out of scope.) Locks in that
      // string-const aliases are intentionally not chased.
      {
        code: `
          const cls = "text-sm";
          const C = () => <div className={cls} />;
        `,
      },
      // Maps-only: a map reached only through an INTERMEDIATE LOCAL is out of
      // range by design. `sz` resolves to a `SIZE[s]` member-access init (not an
      // object/array literal), so the walk stops — documents the limitation.
      {
        code: `
          const SIZE = { a: { box: "text-xs" } };
          function C({ s }: { s: keyof typeof SIZE }) {
            const sz = SIZE[s];
            return <span className={sz.box} />;
          }
        `,
      },
    ],
    invalid: [
      // Tone object-MAP const indexed into cn() in JSX. `TONE` resolves to an
      // object literal, so both values (`text-xs`, `text-sm`) are harvested via
      // the dynamic index `TONE[t]`. The cn call is visited TWICE — once by the
      // JSXAttribute handler (on className's value) and once by the
      // CallExpression handler — so each banned token reports twice:
      // 2 tokens x 2 visits = 4 errors.
      {
        code: `
          const TONE = { muted: "text-xs text-muted-foreground", loud: "text-sm" };
          function C({ t }: { t: keyof typeof TONE }) {
            return <span className={cn("flex", TONE[t])} />;
          }
        `,
        errors: [
          { messageId: "adhocTypography" },
          { messageId: "adhocTypography" },
          { messageId: "adhocTypography" },
          { messageId: "adhocTypography" },
        ],
      },
      // Member access into an object-literal MAP: resolving `styles` harvests the
      // whole object literal, which carries the banned `text-lg`. Only the
      // JSXAttribute handler fires (no cn) → 1 error.
      {
        code: `
          const styles = { title: "text-lg" };
          const C = () => <h1 className={styles.title} />;
        `,
        errors: [{ messageId: "adhocTypography" }],
      },
    ],
  },
);
