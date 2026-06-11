/**
 * Tests for the `no-arbitrary-font-size` lint rule. Run with `bun test` from the
 * repo root (or this file's directory).
 *
 * The rule bans arbitrary `text-[Npx]` / `text-[Nrem]` font-size classes — but
 * only inside a *class-name context* (a `className`/`class` JSX attribute value
 * or a `cn(...)`/`clsx(...)` class-builder argument). A plain string that merely
 * *mentions* such a class (a doc string, comment-as-string, or fixture) must NOT
 * trip the rule. These cases lock both halves in.
 */

import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "./no-arbitrary-font-size";

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
  "no-arbitrary-font-size",
  // The eslint flat-config RuleTester is typed against the legacy Rule shape;
  // the typescript-eslint createRule object is compatible at runtime.
  rule as unknown as Parameters<RuleTester["run"]>[1],
  {
      valid: [
        // A non-className string that merely mentions the banned class — the
        // false-positive case the scoping fix exists to prevent.
        { code: `const DOC = "text-[10px] is banned — use text-3xs";` },
        // Documentation / comment-as-string, likewise untouched.
        { code: `const HINT = \`Avoid text-[12px] in favor of text-xs\`;` },
        // A non-class-builder call with the same string is also ignored.
        { code: `logMessage("text-[11px] appeared");` },
        // Named scale classes in a real className are fine.
        { code: `const el = <div className="text-xs font-medium" />;` },
        // className inside cn(...) with only named classes is fine.
        { code: `const el = <span className={cn("text-2xs", "px-2")} />;` },
      ],
      invalid: [
        // Bare className string literal.
        {
          code: `const el = <div className="text-[12px]" />;`,
          output: `const el = <div className="text-xs" />;`,
          errors: [{ messageId: "arbitraryFontSize" }],
        },
        // cn(...) class-builder call argument — even outside JSX.
        {
          code: `const cls = cn("text-[12px]", "px-2");`,
          output: `const cls = cn("text-xs", "px-2");`,
          errors: [{ messageId: "arbitraryFontSize" }],
        },
        // className={`…`} template-literal form.
        {
          code: `const el = <div className={\`flex text-[10px]\`} />;`,
          output: `const el = <div className={\`flex text-3xs\`} />;`,
          errors: [{ messageId: "arbitraryFontSize" }],
        },
      ],
    },
);

