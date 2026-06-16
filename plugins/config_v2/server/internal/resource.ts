import { join } from "node:path";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { configV2ValuesSchema, configV2ConflictsSchema, configV2TiersSchema, configV2ScopesSchema, configV2ConflictPathsSchema, configV2ModifiedCountsSchema, configV2ScopeForkedSchema, hasConflict, validationIssues, effective, threeWayMerge } from "../../core";
import type { ConfigV2Values, ConfigV2Conflicts, ConfigV2Tiers, ConfigV2Scopes, ConfigV2ConflictPaths, ConfigV2ModifiedCounts, ConfigV2ScopeForked } from "../../core";
import type { ConfigDescriptor, ConfigValues, FieldsRecord, JsonValue } from "../../core";
import { REPO_ROOT } from "@plugins/infra/plugins/paths/server";
import { userScopedDir, discoverScopeIdsIn, discoverScopeIds } from "./scope-paths";
import { jsoncConfigProxy } from "./jsonc-proxy";
import { hasFieldStorageProvider } from "./field-storage-providers";

type ConfigGetter = <F extends FieldsRecord>(d: ConfigDescriptor<F>, scopeId?: string) => ConfigValues<F>;
type ScopeForkedChecker = (scopeId: string) => boolean;

const descriptorByPath = new Map<string, ConfigDescriptor>();
// hierarchyPath per descriptor (storePath minus the trailing `/<name>.jsonc`),
// captured at registration so scope helpers can rebuild scoped dirs.
const hierarchyByDescriptor = new WeakMap<ConfigDescriptor, string>();
let configGetter: ConfigGetter | null = null;
let scopeForkedChecker: ScopeForkedChecker | null = null;

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
// registry (descriptorByPath / configGetter / scopeForkedChecker). Pre-readiness
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

export const configV2ServerResource = defineResource<ConfigV2Values, { path: string; scopeId?: string }>({
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
  global?: Record<string, ConfigV2Values>;
  scopes?: { scopeId: string; path: string; values: ConfigV2Values }[];
  scope?: { scopeId: string; forked: boolean; values: Record<string, ConfigV2Values> };
}

// Boot-time snapshot the client hydrates its cache from so config reads render
// real values on first paint (no flash, no Suspense).
//
// - No scopeId: every descriptor's resolved GLOBAL config, keyed by storePath.
// - scopeId given: that scope's forked-state plus, when forked, its resolved
//   scoped values for the `scope: "app"` descriptors (the themable set). When
//   unforked the scope resolves to global anyway, so we skip the values to keep
//   the payload empty — `useConfig` reads the global key while `forked` is false.
export async function getConfigSnapshot(scopeId?: string): Promise<ConfigSnapshotResult> {
  await registryReady;
  if (scopeId) {
    const forked = scopeForkedChecker ? scopeForkedChecker(scopeId) : false;
    const values: Record<string, ConfigV2Values> = {};
    if (forked) {
      for (const { descriptor, storePath } of getScopedDescriptors("app")) {
        values[storePath] = resolveRedactedConfig(descriptor, scopeId);
      }
    }
    return { scope: { scopeId, forked, values } };
  }
  const global: Record<string, ConfigV2Values> = {};
  // Committed git scopes (config/<hier>/@app/<id>/) resolved for flash-free first
  // paint. Discovered from the REPO config dir so the payload is bounded to
  // version-controlled scopes — runtime user forks are seeded by the theme task.
  const scopes: { scopeId: string; path: string; values: ConfigV2Values }[] = [];
  const repoConfigDir = join(REPO_ROOT, "config");
  for (const [path, descriptor] of descriptorByPath) {
    global[path] = resolveRedactedConfig(descriptor);
    const hierarchyPath = hierarchyByDescriptor.get(descriptor);
    if (!hierarchyPath) continue;
    for (const scopeId of discoverScopeIdsIn(repoConfigDir, hierarchyPath)) {
      scopes.push({ scopeId, path, values: resolveRedactedConfig(descriptor, scopeId) });
    }
  }
  return { global, scopes };
}

// Compute every descriptor's conflict state for the given scope. `scopeId`
// undefined → base config (paths land exactly where they do today, byte-for-byte
// identical to the pre-scope behavior). A scoped call rebuilds the origin /
// override / ancestor trio under the scope's @app/<id> segment via userScopedDir,
// surfacing a stale scoped override the same way base conflicts surface.
function computeAllConflicts(scopeId?: string): ConfigV2Conflicts {
  const conflicts: ConfigV2Conflicts = {};
  for (const [storePath, descriptor] of descriptorByPath) {
    const parts = storePath.replace(/\.jsonc$/, "").split("/");
    const dir = parts.slice(0, -1).join("/");
    const name = parts[parts.length - 1]!;

    const scopedDir = userScopedDir(dir, scopeId);
    const userOriginPath = join(scopedDir, `${name}.origin.jsonc`);
    const userOverwritesPath = join(scopedDir, `${name}.jsonc`);

    const origin = jsoncConfigProxy(userOriginPath);
    const overwrites = jsoncConfigProxy(userOverwritesPath);

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
      // origin/override above — consistent with how this loop treats its inputs.
      let trueConflictKeys: string[] | undefined;
      const ancestor = jsoncConfigProxy(join(scopedDir, `${name}.ancestor.jsonc`));
      if (ancestor.exists()) {
        const base = ancestor.read()!.content as Record<string, JsonValue>;
        trueConflictKeys = threeWayMerge(
          base,
          overrideValues as Record<string, JsonValue>,
          originValues as Record<string, JsonValue>,
        ).conflicts;
      }

      conflicts[storePath] = {
        kind: "hash",
        originValues,
        overrideValues,
        ...(trueConflictKeys !== undefined ? { trueConflictKeys } : {}),
      };
      continue;
    }

    // No hash conflict, but the effective document may still fail the current
    // schema (a field's type changed under stored data, a hand edit went wrong).
    // The app resolves to defaults; surface it so the user can reset or fix it.
    const issues = validationIssues(descriptor, origin, overwrites);
    if (issues) {
      const stored = effective(origin, overwrites);
      const overrideValues =
        stored && typeof stored === "object" && !Array.isArray(stored)
          ? (stored as Record<string, unknown>)
          : {};
      conflicts[storePath] = {
        kind: "invalid",
        originValues: descriptor.defaults as Record<string, unknown>,
        overrideValues,
        issues,
      };
    }
  }
  return conflicts;
}

export const configV2ConflictsServerResource = defineResource<ConfigV2Conflicts, { scopeId?: string }>({
  key: "config-v2.conflicts",
  mode: "push",
  schema: configV2ConflictsSchema,
  loader: whenRegistryReady(({ scopeId }) => computeAllConflicts(scopeId)),
});

// The scopeIds a single descriptor is customized for (has its own config). Keyed
// by `{ path }` (storePath). Powers the per-descriptor scope tab bar in settings.
function computeDescriptorScopes(path: string): ConfigV2Scopes {
  const descriptor = descriptorByPath.get(path);
  if (!descriptor) {
    throw new Error(`[config-v2] no descriptor registered for scopes path "${path}"`);
  }
  const hierarchyPath = hierarchyByDescriptor.get(descriptor);
  if (!hierarchyPath) return [];
  return discoverScopeIds(hierarchyPath).filter((sid) => scopeHasOwnConfig(descriptor, sid));
}

export const configV2ScopesServerResource = defineResource<ConfigV2Scopes, { path: string }>({
  key: "config-v2.scopes",
  mode: "push",
  schema: configV2ScopesSchema,
  loader: whenRegistryReady(({ path }) => computeDescriptorScopes(path)),
});

// Union of conflicting storePaths across the base scope + every app scope.
// Reuses computeAllConflicts per scope (which only flags descriptors actually
// customized for that scope, since an un-customized scope has no @app/<id>
// files on disk). Backs the nav-row warning badge and rail/sidebar dots.
function computeConflictPaths(): ConfigV2ConflictPaths {
  const paths = new Set<string>(Object.keys(computeAllConflicts()));
  const scopeIds = new Set<string>();
  for (const [, descriptor] of descriptorByPath) {
    const hierarchyPath = hierarchyByDescriptor.get(descriptor);
    if (hierarchyPath) {
      for (const sid of discoverScopeIds(hierarchyPath)) scopeIds.add(sid);
    }
  }
  for (const sid of scopeIds) {
    for (const storePath of Object.keys(computeAllConflicts(sid))) paths.add(storePath);
  }
  return [...paths];
}

export const configV2ConflictPathsServerResource = defineResource<ConfigV2ConflictPaths, {}>({
  key: "config-v2.conflict-paths",
  mode: "push",
  schema: configV2ConflictPathsSchema,
  loader: whenRegistryReady(() => computeConflictPaths()),
});

// Per-descriptor count of BASE fields whose effective value differs from the
// schema default (paths with zero modified fields are omitted). Compared
// structurally (JSON) so an object/list field at its default never falsely
// counts. Secret-backed fields are redacted to their defaults by
// resolveRedactedConfig before this runs, so they never register as modified —
// matching what the client resolves. Backs the nav-row modified-count badge and
// the "Modified only" filter from one data-level read (no per-row config hook).
function computeModifiedCounts(): ConfigV2ModifiedCounts {
  const counts: ConfigV2ModifiedCounts = {};
  for (const [storePath, descriptor] of descriptorByPath) {
    const values = resolveRedactedConfig(descriptor);
    const defaults = descriptor.defaults as Record<string, unknown>;
    let count = 0;
    for (const key of Object.keys(descriptor.fields)) {
      if (JSON.stringify(values[key]) !== JSON.stringify(defaults[key])) count++;
    }
    if (count > 0) counts[storePath] = count;
  }
  return counts;
}

export const configV2ModifiedCountsServerResource = defineResource<ConfigV2ModifiedCounts, {}>({
  key: "config-v2.modified-counts",
  mode: "push",
  schema: configV2ModifiedCountsSchema,
  loader: whenRegistryReady(() => computeModifiedCounts()),
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
// base; an untracked scope resolves base live. Broader than isForked, which is
// override-only: a committed git scope has an origin but no user override, yet
// must still resolve to its scoped values.
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

export function setScopeForkedChecker(checker: ScopeForkedChecker): void {
  scopeForkedChecker = checker;
}

export const configV2ScopeForkedServerResource = defineResource<ConfigV2ScopeForked, { scopeId: string }>({
  key: "config-v2.scope-forked",
  mode: "push",
  schema: configV2ScopeForkedSchema,
  loader: whenRegistryReady(({ scopeId }) => ({ forked: scopeForkedChecker ? scopeForkedChecker(scopeId) : false })),
});

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

export const configV2TiersServerResource = defineResource<ConfigV2Tiers, { path: string; scopeId?: string }>({
  key: "config-v2.tiers",
  mode: "push",
  schema: configV2TiersSchema,
  loader: whenRegistryReady(({ path, scopeId }) => computeTiers(path, scopeId)),
});

export function getAllDescriptors(): [string, ConfigDescriptor][] {
  return [...descriptorByPath.entries()];
}
