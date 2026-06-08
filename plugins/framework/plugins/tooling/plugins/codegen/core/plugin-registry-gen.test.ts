/**
 * Regression test for the comment/string robustness of `discoverCollectedDirs`.
 *
 * The trigger bug: a `defineCollectedDir("…")` written inside a code comment (or
 * embedded in a string literal) was matched by a raw-text regex and silently
 * produced a phantom collected-dir registry. Routing the scan through
 * `findMarkerCalls` (which masks comments/strings/regex) must ignore those while
 * still discovering genuine calls. Run with `bun test` from the repo root.
 */

import { test, expect, afterAll } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { discoverCollectedDirs } from "./plugin-registry-gen";

const root = mkdtempSync(join(tmpdir(), "collected-dir-test-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));

/** Write a core/index.ts barrel for a plugin under <root>/plugins/<name>/core. */
function writeCoreBarrel(pluginName: string, contents: string) {
  const coreDir = join(root, "plugins", pluginName, "core");
  mkdirSync(coreDir, { recursive: true });
  writeFileSync(join(coreDir, "index.ts"), contents);
}

test("discoverCollectedDirs ignores commented/stringified markers but finds real calls", () => {
  writeCoreBarrel(
    "real",
    [
      'export const realDir = defineCollectedDir("widget");',
    ].join("\n"),
  );
  writeCoreBarrel(
    "phantoms",
    [
      '// defineCollectedDir("phantom")',
      'const s = "defineCollectedDir(\'stringed\')";',
      "/* block defineCollectedDir(\"blocked\") */",
    ].join("\n"),
  );

  const dirs = discoverCollectedDirs(root).map((d) => d.dir).sort();

  // Only the genuine call is discovered; the comment- and string-embedded
  // markers must not produce phantom collected dirs.
  expect(dirs).toEqual(["widget"]);
});
