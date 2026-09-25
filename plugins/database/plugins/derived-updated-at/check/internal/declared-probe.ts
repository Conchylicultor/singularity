// The `derived-updated-at:declared` probe. Loads schema files the way
// drizzle-kit does (a synchronous `require()` each, under `bun --bun`), walks
// their top-level exports for drizzle `PgTable`s — exactly the set drizzle-kit
// migrates — and reports every one with a column physically named `updated_at`
// whose table did not register a derived-updatedAt declaration
// (`defineEntity`'s `meta.updatedAt` or `deriveUpdatedAt`) while loading.
//
// The registry is imported through the SAME specifier the schema files use, so
// this process holds one module instance of it and sees their registrations.
//
// Run as: bun --bun declared-probe.ts <absFile...>
// Emits JSON: { undeclared: { table, file }[], loadFailures: { file, error }[] }.
import { getTableColumns, getTableName, is } from "drizzle-orm";
import { PgTable } from "drizzle-orm/pg-core";
import { registeredDerivedUpdatedAt } from "@plugins/database/plugins/derived-updated-at/server";

const withUpdatedAt = new Map<string, string>(); // table → first file exporting it
const loadFailures: { file: string; error: string }[] = [];

for (const file of process.argv.slice(2)) {
  let mod: Record<string, unknown>;
  try {
    mod = require(file) as Record<string, unknown>;
  } catch (e) {
    loadFailures.push({ file, error: String(e) });
    continue;
  }
  for (const value of Object.values(mod)) {
    if (!is(value, PgTable)) continue;
    const hasUpdatedAt = Object.values(getTableColumns(value)).some(
      (col) => col.name === "updated_at",
    );
    const table = getTableName(value);
    if (hasUpdatedAt && !withUpdatedAt.has(table))
      withUpdatedAt.set(table, file);
  }
}

// Read AFTER every file loaded: registration happens at module eval.
const declared = new Set(registeredDerivedUpdatedAt().map((s) => s.table));
const undeclared = [...withUpdatedAt]
  .filter(([table]) => !declared.has(table))
  .map(([table, file]) => ({ table, file }))
  .sort((a, b) => a.table.localeCompare(b.table));

process.stdout.write(JSON.stringify({ undeclared, loadFailures }));
