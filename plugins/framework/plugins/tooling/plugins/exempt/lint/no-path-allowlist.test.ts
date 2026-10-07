/** Tests for `no-path-allowlist`: repo-path arrays and `.startsWith("plugins/…")`
 * are reported in `check/` and `lint/` files only. */

import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import rule from "./no-path-allowlist";

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tsParser,
    parserOptions: { ecmaVersion: "latest", sourceType: "module" },
  },
});

const checkFile = "/repo/plugins/x/check/index.ts";

ruleTester.run(
  "no-path-allowlist",
  rule as unknown as Parameters<RuleTester["run"]>[1],
  {
    valid: [
      { code: `const A = ["a", "b"];`, filename: checkFile },
      { code: `const A = ["server", "web"];`, filename: checkFile },
      { code: `f.startsWith("src/");`, filename: checkFile },
      // A bare plugin root is "is a plugin file", and globs/pathspecs describe a scan.
      { code: `p.startsWith("plugins/");`, filename: checkFile },
      { code: `const A = ["plugins/"];`, filename: checkFile },
      { code: `const A = ["plugins/**/package.json"];`, filename: checkFile },
      // A plugin named `check`: its exempt/ folder is not a check/ folder.
      {
        code: `const A = ["plugins/x/y.ts"];`,
        filename: "/repo/plugins/a/plugins/check/exempt/index.ts",
      },
      // Out of scope: not a check/ or lint/ file.
      {
        code: `const A = ["plugins/x/y.ts"];`,
        filename: "/repo/plugins/x/server/a.ts",
      },
      {
        code: `p.startsWith("plugins/x");`,
        filename: "/repo/plugins/x/web/a.ts",
      },
    ],
    invalid: [
      {
        code: `const A = ["plugins/x/y.ts"];`,
        filename: checkFile,
        errors: [{ messageId: "pathAllowlist" }],
      },
      {
        code: `const A = new Set(["a", "research/foo.md"]);`,
        filename: "/repo/plugins/x/lint/rule.ts",
        errors: [{ messageId: "pathAllowlist" }],
      },
      {
        code: `if (p.startsWith("plugins/infra/")) {}`,
        filename: checkFile,
        errors: [{ messageId: "pathAllowlist" }],
      },
      {
        code: `p.startsWith("research/");`,
        filename: checkFile,
        errors: [{ messageId: "pathAllowlist" }],
      },
      {
        code: "const A = [`cli/x.ts`];",
        filename: checkFile,
        errors: [{ messageId: "pathAllowlist" }],
      },
    ],
  },
);
