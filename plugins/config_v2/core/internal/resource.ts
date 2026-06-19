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
  // Present only for kind === "hash" when an ancestor snapshot exists (a
  // three-way merge is possible). Lists the fields both the user and upstream
  // changed differently — the true conflicts needing manual attention. An empty
  // array means the merge is fully automatic; absent means no ancestor was
  // captured (a pre-existing conflict) so only the binary Keep/Accept apply.
  trueConflictKeys: z.array(z.string()).optional(),
});
export type ConfigV2ConflictEntry = z.infer<typeof configV2ConflictEntrySchema>;

export const configV2ConflictsSchema = z.record(configV2ConflictEntrySchema);
export type ConfigV2Conflicts = z.infer<typeof configV2ConflictsSchema>;

// Per-descriptor conflict, keyed by `{ path, scopeId? }` (mirrors
// configV2TiersResource's key). Returns the single descriptor's conflict entry
// for the selected scope, or null when it has no conflict. Keying by path means
// a change to one descriptor recomputes only that descriptor — the detail page
// subscribes to exactly the path it shows, never the whole ~180-descriptor map.
export const configV2ConflictResource = resourceDescriptor<ConfigV2ConflictEntry | null, { path: string; scopeId?: string }>(
  "config-v2.conflicts",
  configV2ConflictEntrySchema.nullable(),
  null,
);

export const configV2TiersSchema = z.record(z.enum(["default", "git", "user"]));
export type ConfigV2Tiers = z.infer<typeof configV2TiersSchema>;

export const configV2TiersResource = resourceDescriptor<ConfigV2Tiers, { path: string; scopeId?: string }>(
  "config-v2.tiers",
  configV2TiersSchema,
  {},
);

// The list of scopeIds a single descriptor is customized for (has its own
// config — a propagated git scope or a runtime fork). This is the per-descriptor
// element type; the live resource carries the whole map (see below).
export const configV2ScopesSchema = z.array(z.string());
export type ConfigV2Scopes = z.infer<typeof configV2ScopesSchema>;

// The whole membership map: storePath → scopeIds (paths with no scopes are
// omitted). Keyed by `{}` (one global subscription, shared per tab) rather than
// per-`{ path }`, so the many useConfig/useScopeMembership consumers (the theme
// injector subscribes one per token descriptor) collapse to a single sub that
// replays once per WS reconnect instead of paths × tabs. Consumers `select`
// their own path's slice, so a change to one descriptor's scopes only re-renders
// that descriptor's readers. Computed server-side from an in-memory map (no
// per-load filesystem walk).
export const configV2ScopesMapSchema = z.record(configV2ScopesSchema);
export type ConfigV2ScopesMap = z.infer<typeof configV2ScopesMapSchema>;

export const configV2ScopesResource = resourceDescriptor<ConfigV2ScopesMap, {}>(
  "config-v2.scopes",
  configV2ScopesMapSchema,
  {},
);

// storePaths with a conflict in the base scope OR any app scope. Keyed by `{}`
// (the whole list). Powers the nav-row warning badge and the rail/sidebar
// attention dots so a scoped-only conflict is discoverable without opening each
// descriptor — distinct from configV2ConflictResource, which carries a single
// descriptor's conflict entry for one scope.
export const configV2ConflictPathsSchema = z.array(z.string());
export type ConfigV2ConflictPaths = z.infer<typeof configV2ConflictPathsSchema>;

export const configV2ConflictPathsResource = resourceDescriptor<ConfigV2ConflictPaths, {}>(
  "config-v2.conflict-paths",
  configV2ConflictPathsSchema,
  [],
);

// storePaths whose effective BASE config differs from the schema defaults,
// mapped to the count of modified fields (only paths with ≥1 modified field are
// present). Keyed by `{}` (the whole map). Powers the config nav-row modified
// count badge AND the "Modified only" filter without any per-row reactive read —
// computed once server-side, structurally (JSON equality) so an object/list
// field sitting at its default never falsely counts as modified.
export const configV2ModifiedCountsSchema = z.record(z.number());
export type ConfigV2ModifiedCounts = z.infer<typeof configV2ModifiedCountsSchema>;

export const configV2ModifiedCountsResource = resourceDescriptor<ConfigV2ModifiedCounts, {}>(
  "config-v2.modified-counts",
  configV2ModifiedCountsSchema,
  {},
);
