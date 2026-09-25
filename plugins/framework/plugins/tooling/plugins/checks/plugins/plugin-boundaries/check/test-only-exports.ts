// R13: a PUBLIC runtime barrel exports nothing that only tests import.
//
// R12 recognizes a test helper by how it is spelled. This rule recognizes one
// by who uses it: a name published from `<runtime>/index.ts` whose every
// importer is test code (`isTestCodePath` — `*.test.ts`, `__tests__/`,
// `testing/`) is API nothing ships with. `check/` and `lint/` importers are
// not test code here: a check may use a public API.
//
// A name nothing imports at all is out of scope — that is dead code, not a
// test leak.
//
// Pure: `findTestOnlyExports(barrels, uses)` takes what the check's one file
// loop collected (`barrelExportNames` per public barrel, `collectBarrelUses`
// per source file), so the unit test needs no repo.

import { dirname, join } from "path";
import { isTestCodePath } from "@plugins/framework/plugins/plugin-id/core";
import { findImports } from "@plugins/plugin-meta/plugins/parse-utils/core";
import { parseBindingList, splitTopLevelStatements } from "./parse";
import { exportedNames } from "./test-exports";
import type { Violation } from "./unknown-dirs";

/** One importer's use of a public barrel, keyed by the barrel's `index.ts` path. */
export interface BarrelUse {
  barrel: string;
  importer: string;
  /** The barrel's own names the importer takes, or `"all"` for a namespace import from shipping code. */
  names: readonly string[] | "all";
}

const MAX_IMPORTERS_SHOWN = 3;

const FIX =
  "if the importer is this plugin's own test, import the internal file by relative path; " +
  "if another plugin's test needs it (a helper, or a real function it checks against), publish it from `<runtime>/testing/index.ts`; " +
  "move a test only when it tests nothing of its own plugin. " +
  "Then drop the name from the public barrel";

/** The names a public barrel publishes (the default export excluded). */
export function barrelExportNames(src: string): string[] {
  const names: string[] = [];
  for (const { text } of splitTopLevelStatements(src)) {
    const stmt = text.trim();
    if (!stmt.startsWith("export") || /^export\s+default\b/.test(stmt))
      continue;
    const clause = /^export\s+(?:type\s+)?\{([^}]*)\}/.exec(stmt)?.[1];
    if (clause !== undefined) {
      names.push(...exportedNames(clause));
      continue;
    }
    const declared = /^export\s+(?:type|interface)\s+([\w$]+)/.exec(stmt)?.[1];
    if (declared) names.push(declared);
  }
  return names;
}

/**
 * Every use `importer` makes of a public barrel. `barrels` holds the public
 * barrels' `index.ts` paths; a specifier reaches one either as
 * `@plugins/<p>/<runtime>` or as a relative path landing on `<runtime>/index`.
 */
export function collectBarrelUses(
  importer: string,
  src: string,
  barrels: ReadonlySet<string>,
): BarrelUse[] {
  const fromTest = isTestCodePath(importer.split("/"));
  const out: BarrelUse[] = [];
  for (const imp of findImports(src)) {
    if (imp.sideEffect) continue;
    const barrel = resolveBarrel(importer, imp.specifier, barrels);
    if (barrel === null || barrel === importer) continue;
    const clause = imp.clause.trim();
    if (/^(?:type\s+)?\*/.test(clause)) {
      // `import * as X` / `export * from`: which names it reads is not
      // written down. From shipping code, count every name as used; from a
      // test (the `vi.mock(importOriginal)` idiom), count none.
      if (!fromTest) out.push({ barrel, importer, names: "all" });
      continue;
    }
    const names = parseBindingList(clause).map((b) => b.local);
    if (names.length > 0) out.push({ barrel, importer, names });
  }
  return out;
}

function resolveBarrel(
  importer: string,
  specifier: string,
  barrels: ReadonlySet<string>,
): string | null {
  let target: string;
  if (specifier.startsWith("@plugins/")) {
    target = `plugins/${specifier.slice("@plugins/".length)}`;
  } else if (specifier.startsWith(".")) {
    target = join(dirname(importer), specifier);
  } else {
    return null;
  }
  target = target.replace(/\/index(\.tsx?)?$/, "");
  const barrel = `${target}/index.ts`;
  return barrels.has(barrel) ? barrel : null;
}

/** R13 violations: a published name with at least one importer, all of them test code. */
export function findTestOnlyExports(
  barrels: ReadonlyMap<string, readonly string[]>,
  uses: readonly BarrelUse[],
): Violation[] {
  const shipped = new Map<string, Set<string> | "all">();
  const testImporters = new Map<string, Map<string, string[]>>();
  for (const use of uses) {
    if (!isTestCodePath(use.importer.split("/"))) {
      const seen = shipped.get(use.barrel);
      if (seen === "all") continue;
      if (use.names === "all") {
        shipped.set(use.barrel, "all");
        continue;
      }
      const set = seen ?? new Set<string>();
      for (const n of use.names) set.add(n);
      shipped.set(use.barrel, set);
      continue;
    }
    if (use.names === "all") continue;
    const byName = testImporters.get(use.barrel) ?? new Map<string, string[]>();
    for (const n of use.names) {
      const list = byName.get(n) ?? [];
      if (!list.includes(use.importer)) list.push(use.importer);
      byName.set(n, list);
    }
    testImporters.set(use.barrel, byName);
  }

  const out: Violation[] = [];
  for (const [barrel, names] of barrels) {
    const shippedNames = shipped.get(barrel);
    if (shippedNames === "all") continue;
    const byName = testImporters.get(barrel);
    if (!byName) continue;
    for (const name of new Set(names)) {
      const importers = byName.get(name);
      if (!importers || shippedNames?.has(name)) continue;
      const shown = importers
        .slice(0, MAX_IMPORTERS_SHOWN)
        .map((f) => `\`${f}\``);
      const more =
        importers.length > shown.length
          ? ` and ${importers.length - shown.length} more`
          : "";
      out.push({
        rule: "test-only-public-export",
        file: barrel,
        message: `\`${name}\` is public, but only tests import it: ${shown.join(", ")}${more}`,
        fix: FIX,
      });
    }
  }
  return out;
}
