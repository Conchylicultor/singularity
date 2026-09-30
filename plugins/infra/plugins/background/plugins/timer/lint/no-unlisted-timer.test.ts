/** Tests for `no-unlisted-timer`: any `defineTimer(...)` call is reported (the
 * allowlist lives in the plugin's `ignores`, applied by the ESLint config). */

import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "./no-unlisted-timer";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  },
});

ruleTester.run(
  "no-unlisted-timer",
  rule as unknown as Parameters<RuleTester["run"]>[1],
  {
    valid: [
      { code: `defineJob({ name: "x" });` },
      { code: `const defineTimerLike = 1; defineTimerIn(spec, runtime);` },
      { code: `import { defineTimer } from "x"; export { defineTimer };` },
    ],
    invalid: [
      {
        code: `defineTimer({ name: "x", everyMs: 1000, run });`,
        errors: [{ messageId: "unlistedTimer" }],
      },
      {
        code: `timers.defineTimer({ name: "x", everyMs: 1000, run });`,
        errors: [{ messageId: "unlistedTimer" }],
      },
    ],
  },
);
