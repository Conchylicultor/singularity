// R12: a PUBLIC runtime barrel publishes no test support.
//
// Test helpers have their own barrel, `<runtime>/testing/index.ts`, which only
// test code and `check/` may import (see boundaries/CLAUDE.md, "Test code").
// Before it existed, harnesses were mixed into the public API — the fake
// WebSocket in `networking/web`, `createTestDb`, `reset…ForTests` hooks — where
// production code could reach them and the docs listed them as API.
//
// Two spellings give a test helper away without reading its body, and both are
// checked on the public barrel's own statements:
//   - a published name ending in `ForTest`, `ForTests` or `ForTesting`;
//   - a statement taking names from a test-support module: one whose path is
//     test code (`isTestCodePath` — `__tests__/`, `testing/`, `*.test.ts`), or
//     whose file is named `test-support`, `fixture(s)` or `<x>.fixture(s)`.

import { isTestCodePath } from "@plugins/framework/plugins/plugin-id/core";
import { splitTopLevelStatements } from "./parse";
import type { Violation } from "./unknown-dirs";

const TEST_HOOK_NAME_RE = /(ForTests?|ForTesting)$/;
const TEST_SUPPORT_FILE_RE = /^(test-support|fixtures?|.+\.fixtures?)$/;

function isTestSupportSpecifier(specifier: string): boolean {
  if (!specifier.startsWith(".")) return false;
  const segments = specifier.split("/");
  const file = (segments.at(-1) ?? "").replace(/\.tsx?$/, "");
  return isTestCodePath(segments) || TEST_SUPPORT_FILE_RE.test(file);
}

/** The local names a `{ … }` clause publishes (`a as b` → `b`, `type X` → `X`). */
export function exportedNames(clause: string): string[] {
  return clause
    .split(",")
    .map((part) => part.trim().replace(/^type\s+/, ""))
    .filter(Boolean)
    .map((part) =>
      part
        .split(/\s+as\s+/)
        .at(-1)!
        .trim(),
    );
}

/** R12 violations in one public runtime barrel's source. */
export function findTestSupportInBarrel(
  barrelRel: string,
  src: string,
): Violation[] {
  const testingBarrel = barrelRel.replace(/index\.ts$/, "testing/index.ts");
  const fix = `publish test helpers from \`${testingBarrel}\` (imported as \`@plugins/<p>/<runtime>/testing\`), which only test code and check/ may import`;
  const out: Violation[] = [];
  for (const { text, line } of splitTopLevelStatements(src)) {
    const stmt = text.trim();
    if (!stmt.startsWith("export") && !stmt.startsWith("import")) continue;
    const specifier = /from\s*["']([^"']+)["']$/.exec(stmt)?.[1];
    if (specifier !== undefined && isTestSupportSpecifier(specifier)) {
      out.push({
        rule: "test-support-in-public-barrel",
        file: `${barrelRel}:${line}`,
        message: `public barrel takes names from test-support module \`${specifier}\``,
        fix,
      });
      continue;
    }
    if (!stmt.startsWith("export")) continue;
    const clause = /\{([^}]*)\}/.exec(stmt)?.[1];
    if (clause === undefined) continue;
    for (const name of exportedNames(clause)) {
      if (!TEST_HOOK_NAME_RE.test(name)) continue;
      out.push({
        rule: "test-support-in-public-barrel",
        file: `${barrelRel}:${line}`,
        message: `public barrel exports test hook \`${name}\``,
        fix,
      });
    }
  }
  return out;
}
