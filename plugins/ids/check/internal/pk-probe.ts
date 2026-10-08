// The `ids:pk-declared` probe. Loads schema files the way drizzle-kit does (a
// synchronous `require()` each, under `bun --bun`), walks their top-level
// exports for drizzle `PgTable`s — exactly the set drizzle-kit migrates — and
// reports every table keyed by a single column named `id` whose column is not
// a declared id: `idColumn(kind)` / a `defineEntity` record's
// `idKindField(kind)` (its decoder is a kind's stored-id schema) or
// `externalIdColumn`. Read off the BUILT column, so a table counts however it
// was spelled, and wherever its field record lives.
//
// `idColumnDeclaration` is imported through the SAME specifier the schema
// files use, so this process holds one module instance of its registries.
//
// Run as: bun --bun pk-probe.ts <absFile...>
// Emits JSON: { undeclared: { table, file }[], loadFailures: { file, error }[] }.
import { getTableColumns, getTableName, is } from "drizzle-orm";
import { PgTable, getTableConfig } from "drizzle-orm/pg-core";
import { idColumnDeclaration } from "@plugins/ids/server";

const undeclared = new Map<string, string>(); // table → first file exporting it
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
    // A composite `primaryKey({ columns })` is not a single-column id.
    if (getTableConfig(value).primaryKeys.length > 0) continue;
    const id = Object.values(getTableColumns(value)).find(
      (col) => col.primary && col.name === "id",
    );
    if (!id || idColumnDeclaration(id).kind !== "undeclared") continue;
    const table = getTableName(value);
    if (!undeclared.has(table)) undeclared.set(table, file);
  }
}

process.stdout.write(
  JSON.stringify({
    undeclared: [...undeclared]
      .map(([table, file]) => ({ table, file }))
      .sort((a, b) => a.table.localeCompare(b.table)),
    loadFailures,
  }),
);
