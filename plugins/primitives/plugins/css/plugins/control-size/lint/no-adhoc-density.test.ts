/**
 * Tests for the `no-adhoc-density` lint rule. Run with `bun test`:
 *
 *   bun test plugins/primitives/plugins/css/plugins/control-size/lint/no-adhoc-density.test.ts
 *
 * Covers both per-instance density escapes: a `size=` prop and a fixed
 * `h-*`/`size-*`/`control-*` class on a density-participating primitive
 * (the registry gate), plus the false-negative carve-outs (non-registry tags,
 * non-numeric `size-full`, width/margin/text classes, the `Row`/`SelectTrigger`/
 * `LaunchControl` controls whose `size` prop is legitimate).
 */

import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "./no-adhoc-density";

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
  "no-adhoc-density",
  // The eslint flat-config RuleTester is typed against the legacy Rule shape;
  // the typescript-eslint createRule object is compatible at runtime.
  rule as unknown as Parameters<RuleTester["run"]>[1],
  {
    valid: [
      // A non-density class (width + text) on a registry primitive is fine.
      { code: `const C = () => <Button className="px-2 text-sm">x</Button>;` },
      // A margin on a registry primitive is fine.
      { code: `const C = () => <Avatar className="ml-2" />;` },
      // `size-full` is not a numeric size token — it stays legal.
      { code: `const C = () => <Badge className="size-full">x</Badge>;` },
      // `Row` is NOT in the density registry — its `size` prop is legitimate.
      { code: `const C = () => <Row size="sm">x</Row>;` },
      // `SelectTrigger` is NOT a density primitive — its `size` prop is legitimate.
      { code: `const C = () => <SelectTrigger size="sm" />;` },
      // `LaunchControl` is NOT a density primitive — its `size` prop is legitimate.
      { code: `const C = () => <LaunchControl size="icon" />;` },
      // A plain `<div>` is not a registry tag — a fixed height class is fine.
      { code: `const C = () => <div className="h-8" />;` },
    ],
    invalid: [
      // `size=` prop on density primitives → densitySizeProp.
      {
        code: `const C = () => <Badge size="sm">x</Badge>;`,
        errors: [{ messageId: "densitySizeProp" }],
      },
      {
        code: `const C = () => <IconButton size="lg" icon={<svg />} />;`,
        errors: [{ messageId: "densitySizeProp" }],
      },
      {
        code: `const C = () => <Avatar size="md" />;`,
        errors: [{ messageId: "densitySizeProp" }],
      },
      // Fixed height/size/control class on density primitives → densitySizeClass.
      {
        code: `const C = () => <Button className="h-7">x</Button>;`,
        errors: [{ messageId: "densitySizeClass" }],
      },
      {
        code: `const C = () => <ToggleChip className="control-lg">x</ToggleChip>;`,
        errors: [{ messageId: "densitySizeClass" }],
      },
      {
        code: `const C = () => <StatusDot className="size-2" />;`,
        errors: [{ messageId: "densitySizeClass" }],
      },
      // A class parked in a same-file object-literal MAP indexed in a class
      // context is harvested by the shared walk → densitySizeClass.
      {
        code: `
          const M = { a: "h-8" };
          const C = () => <Badge className={M.a}>x</Badge>;
        `,
        errors: [{ messageId: "densitySizeClass" }],
      },
    ],
  },
);
