import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";

export const configV2ValuesSchema = z.record(z.unknown());
export type ConfigV2Values = z.infer<typeof configV2ValuesSchema>;

// `resident`: every descriptor's resolved document is hydrated once, before
// first paint (the config boot task). Config surfaces mount at any point in the
// session — a sidebar toggled open an hour in — so an evicted cache entry would
// put `useConfig` back in `pending` there, and a config read has no honest
// stand-in for "unknown" (its defaults are a legitimate value). Small documents,
// read by everything: hold them for the tab's lifetime.
export const configV2Resource = resourceDescriptor<
  ConfigV2Values,
  { path: string; scopeId?: string }
>("config-v2.values", configV2ValuesSchema, {}, { resident: true });

// A single structured validation failure. `path` is the zod issue path as an
// array (`["items", 6]`) so consumers can drill the offending value out of the
// stored document and render it inline; `message` is the human zod message.
export const configV2ValidationIssueSchema = z.object({
  path: z.array(z.union([z.string(), z.number()])),
  message: z.string(),
});
export type ConfigV2ValidationIssue = z.infer<
  typeof configV2ValidationIssueSchema
>;

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
export const configV2ConflictResource = resourceDescriptor<
  ConfigV2ConflictEntry | null,
  { path: string; scopeId?: string }
>("config-v2.conflicts", configV2ConflictEntrySchema.nullable(), null);

export const configV2TiersSchema = z.record(z.enum(["default", "git", "user"]));
export type ConfigV2Tiers = z.infer<typeof configV2TiersSchema>;

export const configV2TiersResource = resourceDescriptor<
  ConfigV2Tiers,
  { path: string; scopeId?: string }
>("config-v2.tiers", configV2TiersSchema, {});

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

// Resident for the same reason as the values resource above: it is the
// authoritative scoped-vs-global decision every `useConfig` read keys off, so
// losing it re-introduces the global→scoped flash the boot hydration removed.
export const configV2ScopesResource = resourceDescriptor<ConfigV2ScopesMap, {}>(
  "config-v2.scopes",
  configV2ScopesMapSchema,
  {},
  { resident: true },
);

// WHERE one descriptor conflicts: its base document, and/or the named app scopes
// it is customized for. Never a bare boolean — a warning badge that cannot say
// which scope it is about sends the user to a detail pane that opens on Base and
// shows nothing, which is exactly the dead end this shape exists to prevent.
// `base: false` with a non-empty `scopeIds` is the scoped-only case.
export const configV2ConflictLocationsSchema = z.object({
  base: z.boolean(),
  scopeIds: z.array(z.string()),
});
export type ConfigV2ConflictLocations = z.infer<
  typeof configV2ConflictLocationsSchema
>;

// storePath → where it conflicts. Only conflicting paths are present, so
// membership answers "does this row warn?" and the value answers "about what?".
// Keyed by `{}` (the whole map). Powers the nav-row warning badge, the scope-tab
// dots and the rail/sidebar attention dots — distinct from
// configV2ConflictResource, which carries ONE descriptor's conflict entry (the
// full origin/override documents) for ONE scope.
export const configV2ConflictMapSchema = z.record(
  configV2ConflictLocationsSchema,
);
export type ConfigV2ConflictMap = z.infer<typeof configV2ConflictMapSchema>;

export const configV2ConflictMapResource = resourceDescriptor<
  ConfigV2ConflictMap,
  {}
>("config-v2.conflict-locations", configV2ConflictMapSchema, {});

// storePaths whose BASE config the USER LAYER has changed, mapped to the count of
// such fields (only paths with ≥1 are present). Keyed by `{}` (the whole map).
// Powers the config nav-row modified count badge AND the "Modified only" filter
// without any per-row reactive read.
//
// "Modified" is measured against the GIT LAYER — the generated origin ⊕ any
// committed authored override, as propagated by `./singularity build` — not
// against `descriptor.defaults`. A value the repo commits is not something the
// user changed. Same basis as the per-field `config-v2.tiers` attribution the
// detail pane's stripes and Reset buttons read, so badge and pane agree.
export const configV2ModifiedCountsSchema = z.record(z.number());
export type ConfigV2ModifiedCounts = z.infer<
  typeof configV2ModifiedCountsSchema
>;

export const configV2ModifiedCountsResource = resourceDescriptor<
  ConfigV2ModifiedCounts,
  {}
>("config-v2.modified-counts", configV2ModifiedCountsSchema, {});
