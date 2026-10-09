import { describe, it } from "bun:test";
import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { lintToolkit } from "@plugins/framework/plugins/tooling/plugins/lint/core/testing";
import buildRule from "./no-fill-color-as-text";

const rule = buildRule(lintToolkit);

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

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

ruleTester.run(
  "no-fill-color-as-text",
  rule as unknown as Parameters<RuleTester["run"]>[1],
  {
    valid: [
      { code: `const C = () => <span className="text-primary-text" />;` },
      {
        code: `const C = () => <span className="hover:text-destructive-text/80" />;`,
      },
      {
        code: `const C = () => <button className="bg-primary text-primary-foreground" />;`,
      },
      { code: `const note = "never text-primary";` },
    ],
    invalid: [
      {
        code: `const C = () => <span className="text-primary" />;`,
        errors: [{ messageId: "fillAsText" }],
      },
      {
        code: `const v = cva("hover:text-destructive/70");`,
        errors: [{ messageId: "fillAsText" }],
      },
      {
        code: `const T = { e: "text-destructive" }; const C = () => <p className={cn(T.e)} />;`,
        errors: [{ messageId: "fillAsText" }, { messageId: "fillAsText" }],
      },
    ],
  },
);
