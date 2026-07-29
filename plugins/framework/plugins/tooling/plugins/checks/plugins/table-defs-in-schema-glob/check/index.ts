import { grepCode } from "@plugins/framework/plugins/tooling/plugins/checks/core";
import { schemaGlobFiles } from "@plugins/database/plugins/migrations/core";
import { IMPERATIVE_PUBLIC_TABLE_CONSTS } from "@plugins/database/plugins/derived-views/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";

type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

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

// The imperative-public-table allowlist (the same single source the
// orphaned-db-tables check reads): each entry is a public table created
// imperatively on boot (CREATE TABLE IF NOT EXISTS), NOT through drizzle. Such a
// table legitimately needs a `pgTable(...)` READ handle outside the schema glob:
// it must NOT be in the glob (drizzle would emit a spurious migration), yet the
// loader still wants a typed handle. Because the table is never drizzle-managed,
// the "silently vanishes from migration generation" footgun does not apply — the
// author already knows it isn't migrated. So a `pgTable(<CONST>, ...)` whose name
// argument is one of the allowlist's name constants is allowed.
//
// `IMPERATIVE_PUBLIC_TABLE_CONSTS` publishes those identifiers as DATA (the keys
// of the shorthand `IMPERATIVE_PUBLIC_TABLES` record). This check used to regex
// them out of the allowlist module's TEXT, which shared the truncation and
// prose-hijack hazards of the drizzle.config.ts parse deleted in
// research/2026-07-29-global-drizzle-schema-glob-single-source.md — and a partial
// parse silently dropped exemptions, flagging legitimate read handles. There is
// no parse any more.
const IMPERATIVE_NAME_CONSTS = new Set(IMPERATIVE_PUBLIC_TABLE_CONSTS);

/**
 * True when a `pgTable(...)` match line is a sanctioned imperative-table read
 * handle: its first argument is one of the allowlist's name constants. Matches
 * `pgTable(<IDENT>` (a bare identifier — string-literal names are never
 * imperative-table handles, those go through the schema glob).
 */
export function isImperativeReadHandle(
  lineText: string,
  imperativeNameConsts: Set<string>,
): boolean {
  const m = lineText.match(/pgTable\(\s*([A-Za-z_$][A-Za-z0-9_$]*)/);
  return m !== null && imperativeNameConsts.has(m[1]!);
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
    const root = await getWorktreeRoot();

    // 1. Glob-matched file set — derived from drizzle.config.ts (single source),
    // enumerated by the shared migrations/core helper (fails loud if unparseable).
    const globFiles = new Set(schemaGlobFiles(root));

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
      if (isImperativeReadHandle(m.text, IMPERATIVE_NAME_CONSTS)) continue;
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
