/**
 * Tests for the `no-adhoc-layout` lint rule. Run with `bun test` from the repo
 * root (or this file's directory).
 *
 * The rule bans raw Tailwind layout-composition utilities — flow (`flex`,
 * `grid`, `flex-1`, `basis-*`), space-sharing (`shrink-*`, `grow-*`, `min-w-0`),
 * alignment (`items-*`, `justify-*`, `place-*`, `self-*`), positioning
 * (`absolute`, `fixed`, `sticky`, `inset-*`), and clipping (`overflow-*`) —
 * redirecting them to the layout primitives. The tricky valid cases this file
 * locks in: positioning *context* (`relative`/`static`) and sizing (`w-*`,
 * `min-w-fit`) are NOT layout mechanics and must pass; `placeholder-*` must not
 * trip the `place-*` matcher; `inset-ring-*` must not trip the `inset-*` matcher.
 */

import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "./no-adhoc-layout";

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
  "no-adhoc-layout",
  // The eslint flat-config RuleTester is typed against the legacy Rule shape;
  // the typescript-eslint createRule object is compatible at runtime.
  rule as unknown as Parameters<RuleTester["run"]>[1],
  {
    valid: [
      // Positioning CONTEXT is benign — only the children-positioning keywords
      // (absolute/fixed/sticky) and the offsets (inset-*) are banned.
      { code: `const el = <div className="relative" />;` },
      { code: `const el = <div className="static" />;` },
      // Sizing is not a layout mechanic — only the `min-w-0` footgun is banned.
      { code: `const el = <div className="w-full h-screen size-4 min-w-fit max-w-prose" />;` },
      // Non-flow display values are untouched.
      { code: `const el = <div className="block hidden inline" />;` },
      // `placeholder-*` must not be caught by the `place-*` alignment matcher.
      { code: `const el = <input className="placeholder-muted" />;` },
      // `inset-ring-*` is a box-shadow utility, not positioning.
      { code: `const el = <div className="inset-ring-2" />;` },
      // Spacing / z-index belong to sibling rules, not this one.
      { code: `const el = <div className="gap-sm p-md z-base" />;` },
      // A non-className string that merely mentions a banned class — the
      // class-name-context scoping must not trip on it.
      { code: `const DOC = "flex is banned — use <Stack>";` },
    ],
    invalid: [
      // Flow / display.
      { code: `const el = <div className="flex" />;`, errors: [{ messageId: "adhocLayout" }] },
      {
        code: `const el = <div className="flex flex-col" />;`,
        errors: [{ messageId: "adhocLayout" }, { messageId: "adhocLayout" }],
      },
      { code: `const el = <div className="flex-1" />;`, errors: [{ messageId: "adhocLayout" }] },
      { code: `const el = <div className="grid" />;`, errors: [{ messageId: "adhocLayout" }] },
      {
        code: `const el = <div className="grid-cols-3" />;`,
        errors: [{ messageId: "adhocLayout" }],
      },
      {
        code: `const el = <div className="col-span-2" />;`,
        errors: [{ messageId: "adhocLayout" }],
      },
      { code: `const el = <div className="basis-1/2" />;`, errors: [{ messageId: "adhocLayout" }] },
      // Space-sharing.
      { code: `const el = <div className="shrink-0" />;`, errors: [{ messageId: "adhocLayout" }] },
      { code: `const el = <div className="grow" />;`, errors: [{ messageId: "adhocLayout" }] },
      { code: `const el = <div className="min-w-0" />;`, errors: [{ messageId: "adhocLayout" }] },
      // Alignment / distribution.
      {
        code: `const el = <div className="items-center" />;`,
        errors: [{ messageId: "adhocLayout" }],
      },
      {
        code: `const el = <div className="justify-between" />;`,
        errors: [{ messageId: "adhocLayout" }],
      },
      {
        code: `const el = <div className="place-items-center" />;`,
        errors: [{ messageId: "adhocLayout" }],
      },
      { code: `const el = <div className="self-end" />;`, errors: [{ messageId: "adhocLayout" }] },
      // Positioning.
      { code: `const el = <div className="absolute" />;`, errors: [{ messageId: "adhocLayout" }] },
      { code: `const el = <div className="fixed" />;`, errors: [{ messageId: "adhocLayout" }] },
      { code: `const el = <div className="inset-0" />;`, errors: [{ messageId: "adhocLayout" }] },
      {
        code: `const el = <div className="-inset-x-2" />;`,
        errors: [{ messageId: "adhocLayout" }],
      },
      // Clipping.
      {
        code: `const el = <div className="overflow-hidden" />;`,
        errors: [{ messageId: "adhocLayout" }],
      },
      // Variant-prefixed still resolves to the base utility.
      {
        code: `const el = <div className="md:flex hover:absolute" />;`,
        errors: [{ messageId: "adhocLayout" }, { messageId: "adhocLayout" }],
      },
      // Inside a cn(...) class-builder argument.
      {
        code: `const cls = cn("flex", "items-center");`,
        errors: [{ messageId: "adhocLayout" }, { messageId: "adhocLayout" }],
      },
    ],
  },
);
