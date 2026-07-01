import {
  defineServerContribution,
  type ServerContributionToken,
} from "@plugins/framework/plugins/server-core/core";
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

// Eager, additive index of every field-storage builder, populated the instant a
// `Fields.Storage(...)` contribution is DECLARED (barrel module-eval) — see the
// wrapper below. It is a fallback consulted AFTER the live registry, so it stays
// available in the windows where `collectContributions` has not run yet: the
// drizzle-kit codegen subprocess (never boots) and the boot loader pass (evals
// `tables.ts` before `collectContributions`). The capability barrels are pulled
// in eagerly by the `fields/server-capabilities-loader` plugin's
// `eager.generated` manifest, which every eval-time consumer of `resolveField*`
// imports for side-effect — so every builder self-registers here before any
// `defineEntity` body runs, with NO filesystem scan (a `readdirSync` of the
// source tree resolves to a nonexistent `/plugins` inside a `bun --compile`
// release binary). This library plugin is a graph SINK: it never imports a
// capability barrel, so no import cycle can form through it.
const eager = new Map<string, StorageColumnBuilder>();

const storageToken = defineServerContribution<FieldStorageContribution>(
  "fields.storage",
  { docLabel: (p) => p.type.id },
);

// Wrap the raw contribution token so DECLARING a contribution also records it in
// the eager index. The token call itself never touches the live registry — that
// only happens in `collectContributions` at boot — so this wrapper is the sole
// mechanism that makes builders resolvable in the pre-collect eval window.
// `getContributions` is carried through unchanged so the live-first resolver
// still reads the collected registry.
const StorageToken = Object.assign(
  (props: FieldStorageContribution) => {
    eager.set(props.type.id, props.build);
    return storageToken(props);
  },
  { getContributions: storageToken.getContributions },
) as unknown as ServerContributionToken<FieldStorageContribution>;

export const Fields = {
  /** Per-type DB column. Contribute `{ type, build }`; keyed by type token. */
  Storage: StorageToken,
};

/** Resolve a field type's column builder by exact token (no `extends` fallback).
 *  Live-first so a test that registers a throwaway type via `collectContributions`
 *  still wins; falls back to the eager self-registered index for codegen / boot
 *  windows. */
export function resolveFieldStorage(
  typeId: string,
): StorageColumnBuilder | undefined {
  const live = Fields.Storage.getContributions().find(
    (c) => c.type.id === typeId,
  )?.build;
  return live ?? eager.get(typeId);
}
