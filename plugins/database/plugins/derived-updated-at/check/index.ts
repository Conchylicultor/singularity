import { relative, resolve } from "path";
import { schemaGlobFiles } from "@plugins/database/plugins/migrations/core";
import { getWorktreeRoot } from "@plugins/infra/plugins/spawn/core";
import { runDeclaredProbe } from "./internal/run-probe";

// Inlined minimal Check shape (mirrors the database/migrations checks) to avoid
// a cross-plugin import of the framework Check type from a check file.
type CheckResult = { ok: true } | { ok: false; message: string; hint?: string };
type Check = { id: string; description: string; run(): Promise<CheckResult> };

// Closes the derived-updatedAt set: a column named `updated_at` means "derived",
// with no exceptions. Static (the schema globs are the complete,
// runtime-independent set of drizzle tables) rather than a boot assert, because
// a composition namespace loads only some plugins, so its registry is
// legitimately partial. Plan: research/2026-09-25-global-derived-updated-at-raw-tables.md.
const declaredCheck: Check = {
  id: "derived-updated-at:declared",
  description:
    "every drizzle schema table with an updated_at column declares how it moves (defineEntity meta.updatedAt / deriveUpdatedAt)",
  async run() {
    const root = await getWorktreeRoot();
    const absFiles = (await schemaGlobFiles(root)).map((f) => resolve(root, f));
    const probe = await runDeclaredProbe(root, absFiles);
    if (probe.kind === "probe-failed") {
      return { ok: false, message: probe.message };
    }
    const problems: string[] = [];
    if (probe.loadFailures.length > 0) {
      problems.push(
        `${probe.loadFailures.length} schema file(s) failed to load, so their tables were not inspected:\n` +
          probe.loadFailures
            .map((f) => `  ${relative(root, f.file)} — ${f.error}`)
            .join("\n"),
      );
    }
    if (probe.undeclared.length > 0) {
      problems.push(
        `${probe.undeclared.length} table(s) have an updated_at column with no derived-updatedAt declaration ` +
          `(it is stamped by hand, so a no-op write moves it and a forgotten stamp does not):\n` +
          probe.undeclared
            .map((u) => `  ${u.table} — ${relative(root, u.file)}`)
            .join("\n"),
      );
    }
    if (problems.length === 0) return { ok: true };
    return {
      ok: false,
      message: problems.join("\n\n"),
      hint:
        "A column named updated_at is derived by the database, never stamped. Declare how it moves: " +
        "wrap a raw pgTable in deriveUpdatedAt(pgTable(…), { touchedBy: { … } }) " +
        "(@plugins/database/plugins/derived-updated-at/server), or give a defineEntity table " +
        "meta.updatedAt: { touchedBy }. A write-time or heartbeat stamp must be spelled " +
        "differently (e.g. persisted_at). See plugins/database/plugins/derived-updated-at/CLAUDE.md.",
    };
  },
};

export default declaredCheck;
