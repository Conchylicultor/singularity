import { statSync } from "node:fs";
import { join } from "node:path";
import { defineExternalResource } from "@plugins/framework/plugins/server-core/core";
import { configV2ValuesSchema, configV2ConflictEntrySchema, configV2TiersSchema, configV2ScopesMapSchema, configV2ConflictPathsSchema, configV2ModifiedCountsSchema, hasConflict, validationIssues, effective, threeWayMerge } from "../../core";
import type { ConfigV2Values, ConfigV2ConflictEntry, ConfigV2Tiers, ConfigV2ScopesMap, ConfigV2ConflictPaths, ConfigV2ModifiedCounts } from "../../core";
import type { ConfigDescriptor, ConfigValues, JsonValue } from "../../core";
import type { FieldsRecord } from "@plugins/fields/core";
import { userScopedDir, discoverScopeIds } from "./scope-paths";
import { jsoncConfigProxy } from "./jsonc-proxy";
import { hasFieldStorageProvider } from "./field-storage-providers";

type ConfigGetter = <F extends FieldsRecord>(d: ConfigDescriptor<F>, scopeId?: string) => ConfigValues<F>;

const descriptorByPath = new Map<string, ConfigDescriptor>();
// hierarchyPath per descriptor (storePath minus the trailing `/<name>.jsonc`),
// captured at registration so scope helpers can rebuild scoped dirs.
const hierarchyByDescriptor = new WeakMap<ConfigDescriptor, string>();
let configGetter: ConfigGetter | null = null;

// In-memory derived state, the single source these aggregate loaders read so a
// subscribe / WS-reconnect-replay / boot-snapshot read is a pure memory read
// (no per-load filesystem walk). The AUTHORITATIVE predicates are still on disk
// (scopeHasOwnConfig / effective-vs-default); these caches are recomputed from
// them via the refresh* fns ONLY when a config file actually changes (boot,
// fork, scoped write/delete), so the loaders stop touching disk.
//
// Being event-fed, they are only as fresh as the events: a config file that
// changes without producing a watcher callback leaves them stale until the next
// restart. conflict-paths used to be maintained this way too and no longer is —
// see the fingerprint-memoized derivation below.

// storePath → scopeIds the descriptor has its own config for (empty paths omitted).
const scopeMembers = new Map<string, string[]>();
// storePath → count of BASE fields differing from defaults (zero-count omitted).
const modifiedCounts = new Map<string, number>();

// Registry readiness gate. The server serves WS/HTTP resource subscriptions before
// onReady runs initRegistry, so a client can subscribe before descriptors are
// registered. The loader awaits this promise rather than answering with an empty
// config — an incomplete config object crashes consumers that destructure fields.
// initRegistry calls markRegistryReady() once every descriptor is registered.
let resolveRegistryReady!: () => void;
const registryReady = new Promise<void>((resolve) => {
  resolveRegistryReady = resolve;
});

export function markRegistryReady(): void {
  resolveRegistryReady();
}

// Wraps a loader so it resolves only after initRegistry has populated the
// registry (descriptorByPath / configGetter). Pre-readiness
// the server already serves subscriptions, so without this gate a loader answers
// from empty state — emitting an incomplete/wrong resource the client then caches.
function whenRegistryReady<A, R>(fn: (arg: A) => R | Promise<R>): (arg: A) => Promise<R> {
  return async (arg: A) => {
    await registryReady;
    return fn(arg);
  };
}

// Resolve a descriptor's effective values for a scope, with storage-provider
// (secret) fields redacted to their defaults before leaving the server. Shared
// by the per-key resource loader and the boot snapshot so redaction can't drift.
function resolveRedactedConfig(descriptor: ConfigDescriptor, scopeId?: string): ConfigV2Values {
  if (!configGetter) {
    throw new Error("[config-v2] config getter not initialized");
  }
  const values = configGetter(descriptor, scopeId) as ConfigV2Values;
  const redacted = { ...values };
  for (const [key, field] of Object.entries(descriptor.fields)) {
    if (hasFieldStorageProvider(field.type.id)) {
      redacted[key] = field.defaultValue;
    }
  }
  return redacted;
}

export const configV2ServerResource = defineExternalResource<ConfigV2Values, { path: string; scopeId?: string }>({
  key: "config-v2.values",
  mode: "push",
  schema: configV2ValuesSchema,
  loader: whenRegistryReady(({ path, scopeId }) => {
    const descriptor = descriptorByPath.get(path);
    if (!descriptor || !configGetter) {
      // After readiness, an unregistered path is a genuine bug (unknown descriptor)
      // — fail loudly rather than emit an empty config that breaks consumers.
      throw new Error(`[config-v2] no descriptor registered for resource path "${path}"`);
    }
    return resolveRedactedConfig(descriptor, scopeId);
  }),
});

export interface ConfigSnapshotResult {
  global: Record<string, ConfigV2Values>;
  scopes: { scopeId: string; path: string; values: ConfigV2Values }[];
}

// Boot-time snapshot the client hydrates its cache from so config reads render
// real values on first paint (no flash, no Suspense).
//
// `global` is every descriptor's resolved GLOBAL (no-scope) config, keyed by
// storePath. `scopes` is every USER-LAYER scope that has its own config (a
// committed git scope, a runtime fork, OR a plain scoped write) — enumerated via
// the same `discoverScopeIds` + `scopeHasOwnConfig` predicate the live
// `configV2ScopesResource` uses, so the snapshot and the live resource can never
// disagree. Hydrating all scope kinds uniformly means a warm reload of any app
// with its own theme (committed or runtime-forked) paints scoped on frame 0.
export async function getConfigSnapshot(): Promise<ConfigSnapshotResult> {
  await registryReady;
  const global: Record<string, ConfigV2Values> = {};
  const scopes: { scopeId: string; path: string; values: ConfigV2Values }[] = [];
  for (const [path, descriptor] of descriptorByPath) {
    global[path] = resolveRedactedConfig(descriptor);
    const hierarchyPath = hierarchyByDescriptor.get(descriptor);
    if (!hierarchyPath) continue;
    for (const sid of discoverScopeIds(hierarchyPath)) {
      if (!scopeHasOwnConfig(descriptor, sid)) continue;
      scopes.push({ scopeId: sid, path, values: resolveRedactedConfig(descriptor, sid) });
    }
  }
  return { global, scopes };
}

// The three user-layer files a descriptor's conflict state is a function of, for
// one scope. `scopeId` undefined → base config (paths land exactly where they do
// today); a scoped call rebuilds the trio under the scope's @app/<id> segment via
// userScopedDir, so a stale scoped override surfaces the same way base conflicts
// do. Shared by the conflict computation and its fingerprint, so the memo can
// never key off a different set of files than the value it caches.
function conflictFilePaths(
  storePath: string,
  scopeId?: string,
): { origin: string; override: string; ancestor: string } {
  const parts = storePath.replace(/\.jsonc$/, "").split("/");
  const dir = parts.slice(0, -1).join("/");
  const name = parts[parts.length - 1]!;
  const scopedDir = userScopedDir(dir, scopeId);
  return {
    origin: join(scopedDir, `${name}.origin.jsonc`),
    override: join(scopedDir, `${name}.jsonc`),
    ancestor: join(scopedDir, `${name}.ancestor.jsonc`),
  };
}

// Compute a SINGLE descriptor's conflict state for the given scope, or null when
// it has no conflict. Per-descriptor (not whole-map) so the conflicts resource
// recomputes only the descriptor that actually changed. Reads and parses all
// three files — go through derivedDescriptorConflict, which skips this when the
// files are provably unchanged.
function computeDescriptorConflict(storePath: string, scopeId?: string): ConfigV2ConflictEntry | null {
  const descriptor = descriptorByPath.get(storePath);
  if (!descriptor) {
    throw new Error(`[config-v2] no descriptor registered for conflicts path "${storePath}"`);
  }
  const files = conflictFilePaths(storePath, scopeId);

  const origin = jsoncConfigProxy(files.origin);
  const overwrites = jsoncConfigProxy(files.override);

  if (hasConflict(origin, overwrites)) {
    const originData = origin.read();
    const originValues = originData
      ? (originData.content as Record<string, unknown>)
      : (descriptor.defaults as Record<string, unknown>);
    const overrideData = overwrites.read();
    const overrideValues = overrideData
      ? (overrideData.content as Record<string, unknown>)
      : (descriptor.defaults as Record<string, unknown>);

    // When propagate captured a merge base (`<name>.ancestor.jsonc`), a
    // three-way merge is available: compute which fields truly conflict (both
    // sides changed differently) so the UI can offer Merge and flag only those
    // fields. A corrupt ancestor fails loud here exactly like a corrupt
    // origin/override above — consistent with how this treats its inputs.
    let trueConflictKeys: string[] | undefined;
    const ancestor = jsoncConfigProxy(files.ancestor);
    if (ancestor.exists()) {
      const base = ancestor.read()!.content as Record<string, JsonValue>;
      trueConflictKeys = threeWayMerge(
        base,
        overrideValues as Record<string, JsonValue>,
        originValues as Record<string, JsonValue>,
      ).conflicts;
    }

    return {
      kind: "hash",
      originValues,
      overrideValues,
      ...(trueConflictKeys !== undefined ? { trueConflictKeys } : {}),
    };
  }

  // No hash conflict, but the stored override may still be unusable: a foreign
  // leftover from a prior config shape, or a document that fails the current
  // schema (a field's type changed under stored data, a hand edit went wrong).
  // The app degrades to the ORIGIN (authored default), not empty code defaults;
  // surface it so the user can reset or fix it.
  const issues = validationIssues(descriptor, origin, overwrites);
  if (issues) {
    const stored = effective(origin, overwrites);
    const overrideValues =
      stored && typeof stored === "object" && !Array.isArray(stored)
        ? (stored as Record<string, unknown>)
        : {};
    const originData = origin.read();
    const originValues = originData
      ? (originData.content as Record<string, unknown>)
      : (descriptor.defaults as Record<string, unknown>);
    return {
      kind: "invalid",
      originValues,
      overrideValues,
      issues,
    };
  }
  return null;
}

// Identity stamp for one file: "-" when absent, else (inode, mtime-ns, size).
//
// `ino` is what makes this airtight rather than merely likely. Every writer in
// this plugin goes through jsoncConfigProxy.write, which writes a temp file and
// renames it into place — so the inode changes on EVERY write, including an
// acknowledge-conflict restamp that only swaps the 12 hex chars in the `// @hash`
// header and is therefore byte-length-identical (and can land in the same
// millisecond) as the file it replaced. mtime-ns + size then cover in-place
// writes from an external editor.
function fileStamp(path: string): string {
  const st = statSync(path, { bigint: true, throwIfNoEntry: false });
  if (!st) return "-";
  return `${st.ino}:${st.mtimeNs}:${st.size}`;
}

// Fingerprint-keyed memo of computeDescriptorConflict, keyed by (storePath,
// scopeId). Unbounded only in the number of (descriptor × scope) pairs the
// process ever observes; a vanished scope leaves one small stale entry that can
// never be returned for another key.
const conflictMemo = new Map<string, { fingerprint: string; entry: ConfigV2ConflictEntry | null }>();

// THE conflict derivation. A descriptor's conflict state is a pure function of
// its file trio plus the descriptor itself (code — constant for the process), so
// memoize the expensive part on a fingerprint of that trio taken straight off the
// filesystem.
//
// The load-bearing property is WHERE THE KEY COMES FROM: the disk, not an event.
// The aggregate conflict-paths set used to be maintained purely from watcher
// callbacks, so any change that produced no CALLBACK left the nav badge wrong
// until the next restart while the detail pane — which re-derives from disk —
// said the opposite. config-watcher only calls back for paths some CacheEntry
// registered, and scoped entries exist only for scopes discovered at boot or
// forked in-process: a scoped override appearing under @app/<id> for any other
// scope therefore reaches nobody. (Plus the generic hazards: a dropped fsevent, a
// writer parcel doesn't observe.) With a disk-derived key the worst case of a
// missed event is a recompute, never a wrong answer.
//
// Cost: statSync is roughly two orders of magnitude cheaper than
// read + JSONC-parse + hash — a measured ~10ms to sweep every descriptor
// (~250 of them, ~800 stats) against ~1.2s just to re-read the same file trios.
// Deliberately NOT infra/corpus-index:
// that primitive walks directories, persists its index to disk and gates on the
// heavy-read pool — this one indexes a fixed, already-known path trio per
// descriptor, lives only in this process, and must be cheap enough to run inside
// a resource loader.
function derivedDescriptorConflict(storePath: string, scopeId?: string): ConfigV2ConflictEntry | null {
  const files = conflictFilePaths(storePath, scopeId);
  const fingerprint = `${fileStamp(files.origin)}|${fileStamp(files.override)}|${fileStamp(files.ancestor)}`;
  const memoKey = `${storePath}|${scopeId ?? ""}`;

  const memo = conflictMemo.get(memoKey);
  if (memo && memo.fingerprint === fingerprint) return memo.entry;

  const entry = computeDescriptorConflict(storePath, scopeId);
  conflictMemo.set(memoKey, { fingerprint, entry });
  return entry;
}

// The detail-pane banner. Routed through the same memo as the aggregate below so
// the two surfaces share one code path AND one cache — they read the identical
// value for a descriptor, not two independently-derived ones.
export const configV2ConflictServerResource = defineExternalResource<ConfigV2ConflictEntry | null, { path: string; scopeId?: string }>({
  key: "config-v2.conflicts",
  mode: "push",
  schema: configV2ConflictEntrySchema.nullable(),
  loader: whenRegistryReady(({ path, scopeId }) => derivedDescriptorConflict(path, scopeId)),
});

// The whole scope-membership map, read from the in-memory cache (no filesystem
// walk per load). Refreshed via refreshScopeMembers whenever a scoped file moves.
export const configV2ScopesServerResource = defineExternalResource<ConfigV2ScopesMap, {}>({
  key: "config-v2.scopes",
  mode: "push",
  schema: configV2ScopesMapSchema,
  loader: whenRegistryReady(() => Object.fromEntries(scopeMembers)),
});

// Recompute one descriptor's scope membership from the AUTHORITATIVE disk
// predicate (scopeHasOwnConfig) and update the in-memory map. Notifies the global
// scopes resource iff membership changed. Called at boot and at every point a
// scoped origin/override file appears or disappears — never on a plain read.
export function refreshScopeMembers(storePath: string): void {
  const descriptor = descriptorByPath.get(storePath);
  if (!descriptor) return;
  const hierarchyPath = hierarchyByDescriptor.get(descriptor);
  const ids = hierarchyPath
    ? discoverScopeIds(hierarchyPath).filter((sid) => scopeHasOwnConfig(descriptor, sid))
    : [];
  const prev = scopeMembers.get(storePath) ?? [];
  const changed = ids.length !== prev.length || ids.some((id, i) => id !== prev[i]);
  if (ids.length > 0) scopeMembers.set(storePath, ids);
  else scopeMembers.delete(storePath);
  if (changed) configV2ScopesServerResource.notify({});
}

// Whether a descriptor conflicts in base OR any app scope. Bounded to that one
// descriptor's files, so it is cheap enough to run both per-change and inside the
// aggregate sweep.
//
// Scopes are enumerated straight from the filesystem (discoverScopeIds), NOT from
// the event-fed scopeMembers map: a derivation founded on the disk must not
// inherit another cache's staleness, or a scope that appeared without a watcher
// event would be invisible to the badge again. discoverScopeIds is one stat for
// the (usually absent) @app dir, and an absent file trio computes to null — so
// listing a scope that has no files for THIS descriptor costs three stats and
// answers "no conflict".
function descriptorHasAnyConflict(storePath: string): boolean {
  if (derivedDescriptorConflict(storePath) !== null) return true;
  const descriptor = descriptorByPath.get(storePath);
  const hierarchyPath = descriptor && hierarchyByDescriptor.get(descriptor);
  if (!hierarchyPath) return false;
  for (const sid of discoverScopeIds(hierarchyPath)) {
    if (derivedDescriptorConflict(storePath, sid) !== null) return true;
  }
  return false;
}

// Union of conflicting storePaths across base + every app scope. Backs the
// nav-row warning badge and rail/sidebar dots.
//
// THE AUTHORITY: derived on every load from the same computeDescriptorConflict
// (through the same memo) that the per-descriptor `config-v2.conflicts` resource
// answers the detail-pane banner with, so the badge and the banner cannot
// disagree by construction. It is a filesystem sweep, but a stat-only one for
// every descriptor whose files haven't moved since the last derivation.
export const configV2ConflictPathsServerResource = defineExternalResource<ConfigV2ConflictPaths, {}>({
  key: "config-v2.conflict-paths",
  mode: "push",
  schema: configV2ConflictPathsSchema,
  loader: whenRegistryReady(() => [...descriptorByPath.keys()].filter((p) => descriptorHasAnyConflict(p))),
});

// Set last PUBLISHED to subscribers — change detection for the push path ONLY,
// never the value any loader reads. (It used to be the value, which is exactly
// how the badge could get stuck disagreeing with the detail pane.)
const publishedConflictPaths = new Set<string>();

// Push path: on a watcher callback or an in-process resolution, re-derive THIS
// descriptor and notify subscribers immediately if its membership flipped, so
// fixing a conflict clears the badge without waiting for anything to re-read.
// Purely a latency optimization now — the loader re-derives from disk on every
// load regardless, so failing to call this can delay a push but can never leave a
// wrong value behind. Also called at boot to seed both the memo and this snapshot
// (so the first real change doesn't emit a spurious notify).
export function refreshConflictPaths(storePath: string): void {
  if (!descriptorByPath.has(storePath)) return;
  const had = publishedConflictPaths.has(storePath);
  const has = descriptorHasAnyConflict(storePath);
  if (has === had) return;
  if (has) publishedConflictPaths.add(storePath);
  else publishedConflictPaths.delete(storePath);
  configV2ConflictPathsServerResource.notify({});
}

// Per-descriptor count of BASE fields whose effective value differs from the
// schema default (paths with zero modified fields are omitted). Compared
// structurally (JSON) so an object/list field at its default never falsely
// counts. Secret-backed fields are redacted to their defaults by
// resolveRedactedConfig before this runs, so they never register as modified —
// matching what the client resolves. Backs the nav-row modified-count badge and
// the "Modified only" filter from one data-level read (no per-row config hook).
function computeModifiedCount(storePath: string): number {
  const descriptor = descriptorByPath.get(storePath);
  if (!descriptor) return 0;
  const values = resolveRedactedConfig(descriptor);
  const defaults = descriptor.defaults as Record<string, unknown>;
  let count = 0;
  for (const key of Object.keys(descriptor.fields)) {
    if (JSON.stringify(values[key]) !== JSON.stringify(defaults[key])) count++;
  }
  return count;
}

// Modified-count is computed off effective BASE values only (scope-independent),
// so recompute just the changed descriptor and notify the whole-map resource iff
// its count changed. Replaces a full ~180-descriptor rescan on every value change.
export function refreshModifiedCount(storePath: string): void {
  if (!descriptorByPath.has(storePath)) return;
  const prev = modifiedCounts.get(storePath) ?? 0;
  const count = computeModifiedCount(storePath);
  if (count === prev) return;
  if (count > 0) modifiedCounts.set(storePath, count);
  else modifiedCounts.delete(storePath);
  configV2ModifiedCountsServerResource.notify({});
}

export const configV2ModifiedCountsServerResource = defineExternalResource<ConfigV2ModifiedCounts, {}>({
  key: "config-v2.modified-counts",
  mode: "push",
  schema: configV2ModifiedCountsSchema,
  loader: whenRegistryReady(() => Object.fromEntries(modifiedCounts)),
});

export function registerDescriptorPath(path: string, descriptor: ConfigDescriptor, hierarchyPath: string): void {
  descriptorByPath.set(path, descriptor);
  hierarchyByDescriptor.set(descriptor, hierarchyPath);
}

export function getDescriptorByStorePath(path: string): ConfigDescriptor | undefined {
  return descriptorByPath.get(path);
}

export function getHierarchyPath(descriptor: ConfigDescriptor): string | undefined {
  return hierarchyByDescriptor.get(descriptor);
}

// A scope "has its own config" when EITHER its scoped origin (a propagated git
// scope — committed config/<hier>/@app/<id>/) OR its scoped override (a runtime
// fork) exists. Such a scope resolves to its own values and is decoupled from
// base; an untracked scope resolves base live. Covers both a committed git scope
// (origin but no user override) and a runtime fork (override) — the single
// authoritative membership predicate read/write/server-resolve all key off.
export function scopeHasOwnConfig(descriptor: ConfigDescriptor, scopeId: string): boolean {
  if (!scopeId) return false;
  const hierarchyPath = hierarchyByDescriptor.get(descriptor);
  if (!hierarchyPath) return false;
  const scopedDir = userScopedDir(hierarchyPath, scopeId);
  return (
    jsoncConfigProxy(join(scopedDir, `${descriptor.name}.jsonc`)).exists() ||
    jsoncConfigProxy(join(scopedDir, `${descriptor.name}.origin.jsonc`)).exists()
  );
}

// All registered descriptors tagged with the given scope kind, plus their
// hierarchyPath and storePath. Used by fork/unfork to act on the whole scoped set.
export function getScopedDescriptors(
  scope: "app",
): { descriptor: ConfigDescriptor; hierarchyPath: string; storePath: string }[] {
  const out: { descriptor: ConfigDescriptor; hierarchyPath: string; storePath: string }[] = [];
  for (const [storePath, descriptor] of descriptorByPath) {
    if (descriptor.scope !== scope) continue;
    const hierarchyPath = hierarchyByDescriptor.get(descriptor);
    if (!hierarchyPath) continue;
    out.push({ descriptor, hierarchyPath, storePath });
  }
  return out;
}

export function setConfigGetter(getter: ConfigGetter): void {
  configGetter = getter;
}

function fieldValueJson(content: JsonValue | null, key: string): string {
  if (content && typeof content === "object" && !Array.isArray(content)) {
    return JSON.stringify(content[key]);
  }
  return "undefined";
}

function computeTiers(path: string, scopeId?: string): ConfigV2Tiers {
  const descriptor = descriptorByPath.get(path);
  if (!descriptor) {
    // After readiness, an unregistered path is a genuine bug (unknown descriptor)
    // — fail loudly rather than emit empty tiers that render every field as "default".
    throw new Error(`[config-v2] no descriptor registered for tiers path "${path}"`);
  }

  const parts = path.replace(/\.jsonc$/, "").split("/");
  const dir = parts.slice(0, -1).join("/");
  const name = parts[parts.length - 1]!;

  const scopedDir = userScopedDir(dir, scopeId);
  const originPath = join(scopedDir, `${name}.origin.jsonc`);
  const overridePath = join(scopedDir, `${name}.jsonc`);

  const origin = jsoncConfigProxy(originPath);
  const override = jsoncConfigProxy(overridePath);

  const originContent = origin.read()?.content ?? null;
  const overrideContent = override.exists() ? (override.read()?.content ?? null) : null;
  const defaults = descriptor.defaults;

  const tiers: ConfigV2Tiers = {};
  for (const [key, field] of Object.entries(descriptor.fields)) {
    if (hasFieldStorageProvider(field.type.id)) {
      tiers[key] = "default";
      continue;
    }
    const originVal = originContent !== null
      ? fieldValueJson(originContent, key)
      : JSON.stringify(defaults[key]);
    const overrideVal = overrideContent !== null
      ? fieldValueJson(overrideContent, key)
      : null;
    const defaultVal = JSON.stringify(defaults[key]);

    const hasUserOverride = overrideVal !== null && overrideVal !== originVal;
    const isGitModified = originVal !== defaultVal;

    if (hasUserOverride) {
      tiers[key] = "user";
    } else if (isGitModified) {
      tiers[key] = "git";
    } else {
      tiers[key] = "default";
    }
  }
  return tiers;
}

export const configV2TiersServerResource = defineExternalResource<ConfigV2Tiers, { path: string; scopeId?: string }>({
  key: "config-v2.tiers",
  mode: "push",
  schema: configV2TiersSchema,
  loader: whenRegistryReady(({ path, scopeId }) => computeTiers(path, scopeId)),
});

export function getAllDescriptors(): [string, ConfigDescriptor][] {
  return [...descriptorByPath.entries()];
}
