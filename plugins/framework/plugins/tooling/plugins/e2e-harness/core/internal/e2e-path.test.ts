import { describe, expect, test } from "bun:test";
import { isE2eScriptPath } from "./e2e-path";

// The negative cases name REAL plugins (`plugins-refs-resolve` validates every
// `plugins/<id>/…` literal in the tree), so what each one tests is the shape of
// the path, never whether the plugin exists.
describe("isE2eScriptPath", () => {
  test("a script under a plugin's e2e/ dir is an e2e script", () => {
    expect(
      isE2eScriptPath("plugins/apps-core/plugins/tabs/e2e/tabs-verify.ts"),
    ).toBe(true);
    expect(
      isE2eScriptPath(
        "plugins/framework/plugins/tooling/plugins/e2e-harness/e2e/screenshot.ts",
      ),
    ).toBe(true);
    expect(isE2eScriptPath("./plugins/reports/e2e/fan-out-ceiling.ts")).toBe(
      true,
    );
  });

  test("anything else is not", () => {
    // Another folder of the same plugin.
    expect(isE2eScriptPath("plugins/reports/server/index.ts")).toBe(false);
    // A file NAMED e2e is not a directory named e2e.
    expect(isE2eScriptPath("plugins/reports/server/e2e.ts")).toBe(false);
    // A jsdom test is the other runner's business.
    expect(isE2eScriptPath("plugins/reports/web/__tests__/bar.test.tsx")).toBe(
      false,
    );
    // Outside the plugins tree, whatever it is called.
    expect(isE2eScriptPath("scripts/e2e/run.ts")).toBe(false);
    // Not a runnable module.
    expect(isE2eScriptPath("plugins/reports/e2e/README.md")).toBe(false);
  });
});
