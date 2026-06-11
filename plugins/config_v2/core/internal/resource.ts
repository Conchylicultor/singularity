import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

export const configV2ValuesSchema = z.record(z.unknown());
export type ConfigV2Values = z.infer<typeof configV2ValuesSchema>;

export const configV2Resource = resourceDescriptor<ConfigV2Values, { path: string; scopeId?: string }>(
  "config-v2.values",
  configV2ValuesSchema,
  {},
);

// A single structured validation failure. `path` is the zod issue path as an
// array (`["items", 6]`) so consumers can drill the offending value out of the
// stored document and render it inline; `message` is the human zod message.
export const configV2ValidationIssueSchema = z.object({
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string(),
});
export type ConfigV2ValidationIssue = z.infer<typeof configV2ValidationIssueSchema>;

export const configV2ConflictEntrySchema = z.object({
  // "hash"    — the override's @hash is stale vs its origin (upstream defaults
  //             moved); the app resolves to origin until reconciled.
  // "invalid" — the stored document fails the current schema even after default
  //             backfill (e.g. a field's type changed under it); the app
  //             resolves to defaults and the user must reset or fix the file.
  kind: z.enum(["hash", "invalid"]),
  // The origin (upstream) document — this is what the running app resolves to
  // while the conflict is unreconciled, since origin takes precedence on conflict.
  originValues: z.record(z.unknown()),
  // The user's override document as written to disk. The settings editor binds
  // to this so the user can see and reconcile what they configured, independent
  // of what the app currently resolves to.
  overrideValues: z.record(z.unknown()),
  // Structured zod issues, present only when kind === "invalid". Each carries the
  // path (as an array) and message so the UI can pinpoint and render the offending
  // value drilled from `overrideValues`.
  issues: z.array(configV2ValidationIssueSchema).optional(),
});
export const configV2ConflictsSchema = z.record(configV2ConflictEntrySchema);
export type ConfigV2Conflicts = z.infer<typeof configV2ConflictsSchema>;

export const configV2ConflictsResource = resourceDescriptor<ConfigV2Conflicts>(
  "config-v2.conflicts",
  configV2ConflictsSchema,
  {},
);

export const configV2TiersSchema = z.record(z.enum(["default", "git", "user"]));
export type ConfigV2Tiers = z.infer<typeof configV2TiersSchema>;

export const configV2TiersResource = resourceDescriptor<ConfigV2Tiers, { path: string; scopeId?: string }>(
  "config-v2.tiers",
  configV2TiersSchema,
  {},
);

export const configV2ScopeForkedSchema = z.object({ forked: z.boolean() });
export type ConfigV2ScopeForked = z.infer<typeof configV2ScopeForkedSchema>;

// Read-only: is the given scope forked (any @app/<id> override file exists for a
// `scope: "app"` descriptor)? Keyed by scopeId only — scope-level, not per-path.
export const configV2ScopeForkedResource = resourceDescriptor<ConfigV2ScopeForked, { scopeId: string }>(
  "config-v2.scope-forked",
  configV2ScopeForkedSchema,
  { forked: false },
);
