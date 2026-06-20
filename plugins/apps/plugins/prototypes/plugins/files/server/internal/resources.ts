import { z } from "zod";
import { defineExternalResource } from "@plugins/framework/plugins/server-core/core";
import { PrototypeMetaSchema } from "../../core";
import { listPrototypeMetas } from "./list";

/** Server side of `prototypes.list` — re-reads every meta.json on each notify. */
export const prototypesResource = defineExternalResource({
  key: "prototypes.list",
  mode: "push",
  schema: z.array(PrototypeMetaSchema),
  loader: async () => listPrototypeMetas(),
});

/**
 * Server side of `prototypes.version` — a timestamp bumped on every file change.
 * The loader returns the current bump so a cold HTTP fallback still gets a value.
 */
let currentVersion = Date.now();

export const prototypesVersionResource = defineExternalResource({
  key: "prototypes.version",
  mode: "push",
  schema: z.number(),
  loader: async () => currentVersion,
});

/** Advance the version (called by the watcher on any prototype file change). */
export function bumpPrototypesVersion(): void {
  currentVersion = Date.now();
}
