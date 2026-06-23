import { readFileSync } from "fs";
import { relative, resolve } from "path";
import { grepCode } from "@plugins/framework/plugins/tooling/plugins/checks/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

async function getRoot(): Promise<string> {
  const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
    stdout: "pipe",
    stderr: "pipe",
  });
  return (await new Response(proc.stdout).text()).trim();
}

/**
 * Table factories — functions that wrap `pgTable()` with a dynamic name and
 * produce one migrated table per call. Register new ones here: `definedIn`
 * excludes the factory body from Rule 1; `name` enforces call sites for Rule 2.
 * Both are required so the schema-glob footgun can't be reintroduced.
 */
const TABLE_FACTORIES: { name: string; definedIn: string }[] = [
  {
    name: "defineLink",
    definedIn: "plugins/infra/plugins/attachments/server/internal/define-link.ts",
  },
  {
    name: "defineExtension",
    definedIn: "plugins/infra/plugins/entity-extensions/server/internal/define-extension.ts",
  },
  {
    name: "defineTriggerEvent",
    definedIn: "plugins/infra/plugins/events/server/internal/event.ts",
  },
  {
    name: "defineEntity",
    definedIn: "plugins/infra/plugins/entities/server/internal/define-entity.ts",
  },
];

const FACTORY_DEFINITION_FILES = new Set(TABLE_FACTORIES.map((f) => f.definedIn));

// drizzle.config.ts lives here; its `schema: [...]` globs are relative to it.
const MIGRATIONS_PLUGIN_DIR = "plugins/database/plugins/migrations";
const DRIZZLE_CONFIG = `${MIGRATIONS_PLUGIN_DIR}/drizzle.config.ts`;

// The imperative-public-table allowlist (the same single source the
// orphaned-db-tables check reads): each entry is a public table created
// imperatively on boot (CREATE TABLE IF NOT EXISTS), NOT through drizzle. Such a
// table legitimately needs a `pgTable(...)` READ handle outside the schema glob:
// it must NOT be in the glob (drizzle would emit a spurious migration), yet the
// loader still wants a typed handle. Because the table is never drizzle-managed,
// the "silently vanishes from migration generation" footgun does not apply — the
// author already knows it isn't migrated. So a `pgTable(<CONST>, ...)` whose name
// argument is one of the IMPERATIVE_PUBLIC_TABLES name constants is allowed.
const IMPERATIVE_TABLES_FILE =
  "plugins/database/plugins/derived-views/core/internal/imperative-tables.ts";

/**
 * Parse the constant identifiers listed in the `IMPERATIVE_PUBLIC_TABLES` array
 * literal — these are exactly the name constants a sanctioned imperative-table
 * read handle may pass to `pgTable(...)`. Returns the set of identifiers, or an
 * empty set if the array can't be located (the read-handle exemption then
 * applies to nothing — fail closed, never open).
 */
export function parseImperativeTableNameConsts(sourceText: string): Set<string> {
  const arrayMatch = sourceText.match(/IMPERATIVE_PUBLIC_TABLES[^=]*=\s*\[([^\]]*)\]/);
  if (!arrayMatch) return new Set();
  return new Set(
    [...arrayMatch[1]!.matchAll(/[A-Za-z_$][A-Za-z0-9_$]*/g)].map((m) => m[0]),
  );
}

/**
 * True when a `pgTable(...)` match line is a sanctioned imperative-table read
 * handle: its first argument is one of the IMPERATIVE_PUBLIC_TABLES name
 * constants. Matches `pgTable(<IDENT>` (a bare identifier — string-literal names
 * are never imperative-table handles, those go through the schema glob).
 */
export function isImperativeReadHandle(
  lineText: string,
  imperativeNameConsts: Set<string>,
): boolean {
  const m = lineText.match(/pgTable\(\s*([A-Za-z_$][A-Za-z0-9_$]*)/);
  return m !== null && imperativeNameConsts.has(m[1]!);
}

/**
 * Parse the `schema: [ ... ]` string-literal array out of drizzle.config.ts.
 * Returns the array of raw glob patterns (still relative to the config file), or
 * `null` if the array can't be located (the caller fails loudly).
 */
export function parseSchemaGlobs(configText: string): string[] | null {
  // Grab the array body between `schema:` `[` and the matching `]`.
  const arrayMatch = configText.match(/schema\s*:\s*\[([^\]]*)\]/);
  if (!arrayMatch) return null;
  const body = arrayMatch[1]!;
  // Pull each quoted string literal out of the array body.
  const patterns = [...body.matchAll(/["'`]([^"'`]+)["'`]/g)].map((m) => m[1]!);
  if (patterns.length === 0) return null;
  return patterns;
}

/**
 * Resolve drizzle's config-relative globs to repo-relative globs (the form
 * `git grep` / `Bun.Glob` report paths in), then expand them against the repo.
 */
function computeGlobFiles(root: string, configRelativeGlobs: string[]): Set<string> {
  const files = new Set<string>();
  for (const pattern of configRelativeGlobs) {
    const abs = resolve(root, MIGRATIONS_PLUGIN_DIR, pattern);
    const repoRelativeGlob = relative(root, abs);
    for (const match of new Bun.Glob(repoRelativeGlob).scanSync({ cwd: root })) {
      files.add(match);
    }
  }
  return files;
}

/**
 * A path is an in-scope candidate for table-definition scanning iff it is a
 * server file, not a test, and not already a drizzle schema (glob-matched) file.
 */
export function isCandidatePath(path: string, globFiles: Set<string>): boolean {
  if (!/\/server\//.test(path)) return false;
  if (path.endsWith(".test.ts")) return false;
  if (/\/__tests__\//.test(path)) return false;
  if (globFiles.has(path)) return false;
  return true;
}

const check: Check = {
  id: "table-defs-in-schema-glob",
  description:
    "Every concrete table definition (pgTable / table-factory call) must live in a drizzle schema-glob file, or it silently vanishes from migration generation",
  async run() {
    const root = await getRoot();

    // 1. Glob-matched file set — derived from drizzle.config.ts (single source).
    let configText: string;
    try {
      configText = readFileSync(resolve(root, DRIZZLE_CONFIG), "utf-8");
    } catch (err) {
      return {
        ok: false,
        message: `could not read ${DRIZZLE_CONFIG}: ${(err as Error).message}`,
      };
    }
    const schemaGlobs = parseSchemaGlobs(configText);
    if (!schemaGlobs) {
      return {
        ok: false,
        message: `could not parse the \`schema: [...]\` glob array from ${DRIZZLE_CONFIG}`,
      };
    }
    const globFiles = computeGlobFiles(root, schemaGlobs);

    // The sanctioned imperative-table name constants (read once): a `pgTable`
    // read handle on one of these is exempt — the table is created imperatively,
    // not via drizzle, so it correctly lives outside the schema glob.
    const imperativeNameConsts = parseImperativeTableNameConsts(
      readFileSync(resolve(root, IMPERATIVE_TABLES_FILE), "utf-8"),
    );

    const offenders = new Map<string, string>(); // key `path:line` → formatted line

    // 2. Rule 1 — a stray `pgTable(` in a candidate file that isn't a factory
    // body and isn't a sanctioned imperative-table read handle.
    const pgTableMatches = await grepCode({
      root,
      pattern: /pgTable\(/,
      grepArg: "pgTable(",
      fixed: true,
      maskStrings: true,
    });
    for (const m of pgTableMatches) {
      if (!isCandidatePath(m.path, globFiles)) continue;
      if (FACTORY_DEFINITION_FILES.has(m.path)) continue;
      if (isImperativeReadHandle(m.text, imperativeNameConsts)) continue;
      offenders.set(`${m.path}:${m.line}`, `${m.path}:${m.line}:${m.text}`);
    }

    // 3. Rule 2 — a stray factory call in a candidate file. Factory body files
    // define but don't call the factory; still skip them defensively.
    for (const factory of TABLE_FACTORIES) {
      const callMatches = await grepCode({
        root,
        pattern: new RegExp(`${factory.name}\\(`),
        grepArg: `${factory.name}(`,
        fixed: true,
        maskStrings: true,
      });
      for (const m of callMatches) {
        if (!isCandidatePath(m.path, globFiles)) continue;
        if (FACTORY_DEFINITION_FILES.has(m.path)) continue;
        offenders.set(`${m.path}:${m.line}`, `${m.path}:${m.line}:${m.text}`);
      }
    }

    if (offenders.size === 0) return { ok: true };

    const lines = [...offenders.values()].sort();
    return {
      ok: false,
      message: `table definition(s) outside a drizzle schema file in ${lines.length} place(s):\n    ${lines.join("\n    ")}`,
      hint:
        "drizzle-kit only discovers tables in `server/**/internal/tables.ts`, `tables-*.ts`, `schema.ts`, or `schema-*.ts`. A `pgTable`/factory call anywhere else silently vanishes from migration generation — drizzle treats the table as dropped and emits a spurious DROP. Move the `pgTable` / factory call into a schema file; for a factory, re-export `<handle>.table` there per the attachments/entity-extensions convention.",
    };
  },
};

export default check;
