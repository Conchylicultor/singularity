import { readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineServerContribution } from "@plugins/framework/plugins/server-core/core";
import type { PgColumnBuilderBase } from "drizzle-orm/pg-core";
import type { FieldType } from "@plugins/fields/core";

/** Builds the BARE column for a field's value. Modifiers (notNull, default,
 *  primaryKey, json `$type<T>` branding) are applied by the entity builder
 *  (Stage C) from the field spec + entity meta — never baked in here. */
export type StorageColumnBuilder = (name: string) => PgColumnBuilderBase;

export interface FieldStorageContribution {
  type: FieldType;
  build: StorageColumnBuilder;
}

export const Fields = {
  /** Per-type DB column. Contribute `{ type, build }`; keyed by type token. */
  Storage: defineServerContribution<FieldStorageContribution>("fields.storage", {
    docLabel: (p) => p.type.id,
  }),
};

// Eager, additive index of every field-storage builder, populated directly from
// the type barrels. It is a fallback consulted AFTER the live registry, so it
// stays available in the windows where `collectContributions` has not run yet:
// the drizzle-kit codegen subprocess (never boots) and the boot loader pass
// (evals `tables.ts` before `collectContributions`).
let populated = false;
const eager = new Map<string, StorageColumnBuilder>();

/** Sync, idempotent. Pulls every field-storage builder straight from its barrel
 *  so resolution never depends on the boot-time `collectContributions` pass. */
function ensureFieldStoragePopulated(): void {
  if (populated) return;
  populated = true; // set first: a barrel that throws must not loop forever
  const here = dirname(fileURLToPath(import.meta.url)); // .../fields/server/internal
  const fieldsPlugins = resolve(here, "..", "..", "plugins"); // .../fields/plugins
  const req = createRequire(import.meta.url);
  // Generic discovery: */plugins/storage/server/index.ts — a new field type's
  // storage sub-plugin is picked up with zero edits here.
  for (const type of readdirSync(fieldsPlugins)) {
    const barrel = join(
      fieldsPlugins,
      type,
      "plugins",
      "storage",
      "server",
      "index.ts",
    );
    let mod: {
      default?: {
        contributions?: { type?: { id: string }; build?: StorageColumnBuilder }[];
      };
    };
    try {
      mod = req(barrel) as typeof mod;
    } catch (err) {
      // Expected: not every field type has a storage sub-plugin, so the barrel
      // path may not resolve. Skip those; re-throw anything else (a real barrel
      // that fails to evaluate must surface loudly, not vanish).
      const code = (err as { code?: string } | null)?.code;
      if (code === "MODULE_NOT_FOUND" || code === "ERR_MODULE_NOT_FOUND") {
        continue;
      }
      throw err;
    }
    for (const c of mod.default?.contributions ?? []) {
      if (c?.type?.id && c.build) eager.set(c.type.id, c.build);
    }
  }
}

/** Resolve a field type's column builder by exact token (no `extends` fallback).
 *  Live-first so a test that registers a throwaway type via `collectContributions`
 *  still wins; falls back to the eager barrel index for codegen / boot windows. */
export function resolveFieldStorage(
  typeId: string,
): StorageColumnBuilder | undefined {
  ensureFieldStoragePopulated();
  const live = Fields.Storage.getContributions().find(
    (c) => c.type.id === typeId,
  )?.build;
  return live ?? eager.get(typeId);
}
