/**
 * Tests for the `no-declare-identifier` lint rule. Run with `bun test` from the
 * repo root (or this file's directory).
 *
 * The rule bans `declare` as a value binding name, because Bun's TS transform
 * parses a statement beginning with `declare` as a TS ambient declaration and
 * silently erases it from the emitted JS. It must fire on every binding form
 * (const/let/var, function & class names, params, imports, destructuring) but
 * never on look-alikes (`declareResource`), property names (`obj.declare`), or
 * member reads (`obj.declare`).
 */

import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "./no-declare-identifier";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    parserOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
  },
});

// `RuleTester.run` drives the test harness itself (it calls the ambient
// describe/it that bun:test provides), so it must run at module top level —
// never wrapped in a `test()` callback.
ruleTester.run(
  "no-declare-identifier",
  // The eslint flat-config RuleTester is typed against the legacy Rule shape;
  // the typescript-eslint createRule object is compatible at runtime.
  rule as unknown as Parameters<RuleTester["run"]>[1],
  {
    valid: [
      // Look-alike name — must not match on substring.
      { code: `const declareResource = {};` },
      { code: `const declareToken = () => {}; declareToken.getContributions = 1;` },
      // Property name / member read — `declare` as a key is legitimate.
      { code: `const o = { declare: 1 }; o.declare = 2;` },
      { code: `const x = obj.declare;` },
      // Renamed import binding.
      { code: `import { declare as decl } from "x"; decl();` },
    ],
    invalid: [
      {
        code: `const declare = {};`,
        errors: [{ messageId: "bannedBinding" }],
      },
      {
        code: `let declare = 1;`,
        errors: [{ messageId: "bannedBinding" }],
      },
      {
        code: `var declare = 1;`,
        errors: [{ messageId: "bannedBinding" }],
      },
      {
        code: `function declare() {}`,
        errors: [{ messageId: "bannedBinding" }],
      },
      {
        code: `class declare {}`,
        errors: [{ messageId: "bannedBinding" }],
      },
      {
        code: `const f = (declare) => declare;`,
        errors: [{ messageId: "bannedBinding" }],
      },
      {
        code: `import { declare } from "x";`,
        errors: [{ messageId: "bannedBinding" }],
      },
      {
        code: `const { declare } = obj;`,
        errors: [{ messageId: "bannedBinding" }],
      },
      {
        code: `try {} catch (declare) {}`,
        errors: [{ messageId: "bannedBinding" }],
      },
    ],
  },
);
