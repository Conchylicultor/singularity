import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { join, relative } from "node:path";
import type {
  ConfigDescriptor,
  ConfigValues,
  FieldsRecord,
  InferFieldValue,
} from "../../core";
import {
  computeHash,
  readTypedConfig,
  threeWayMerge,
} from "../../core";
import { jsoncConfigProxy } from "./jsonc-proxy";
import type { Disposable, JsonValue } from "../../core";
import { userScopedDir, discoverScopeIds, scopeSegment, BASE_SCOPE } from "./scope-paths";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { watchFileChange } from "./config-watcher";
import { ConfigV2 } from "./contribution";
import { configV2ServerResource, configV2ConflictsServerResource, configV2ScopesServerResource, configV2ConflictPathsServerResource, configV2ModifiedCountsServerResource, configV2TiersServerResource, getDescriptorByStorePath, getHierarchyPath, getScopedDescriptors, markRegistryReady, registerDescriptorPath, scopeHasOwnConfig, setConfigGetter, setScopeForkedChecker } from "./resource";
import { getFieldStorageProvider } from "./field-storage-providers";
import { writeScopedOriginSnapshot } from "./scope-snapshot";
import { asPath, asPluginId } from "@plugins/framework/plugins/plugin-id/core";
import { REPO_ROOT } from "@plugins/infra/plugins/paths/server";
import { CONFIG_DIR } from "./config-dir";

interface CacheEntry {
  scopeId: string;
  values: ConfigValues<FieldsRecord>;
  storePath: string;
  userOriginPath: string;
  userOverwritesPath: string;
  userAncestorPath: string;
  disposables: Disposable[];
}

// 2D cache keyed by (descriptor × scopeId). Inner key "" (BASE_SCOPE) is the base
// (global) entry; "app:<id>" keys are lazily-created scoped entries.
const cacheByDescriptor = new WeakMap<ConfigDescriptor, Map<string, CacheEntry>>();
const subscribersByDescriptor = new WeakMap<ConfigDescriptor, Map<string, Set<(values: ConfigValues<FieldsRecord>) => void>>>();

// All app scopeIds we currently know about — populated when a fork happens and
// whenever a scoped entry is lazily built. Used so a BASE file change can notify
// every currently-un-forked scope (apps tracking base must re-render).
const knownScopeIds = new Set<string>();

function injectCollectionIds(
  doc: Record<string, unknown>,
  fields: FieldsRecord,
): Record<string, unknown> {
  const result = { ...doc };
  for (const [key, field] of Object.entries(fields)) {
    if (!("itemFields" in field)) continue;
    const arr = result[key];
    if (!Array.isArray(arr)) continue;
    let lastRank: Rank | null = null;
    result[key] = arr.map((item: Record<string, unknown>, index: number) => {
      const out = { ...item };
      if (!out.rank || typeof out.rank !== "string") {
        lastRank = Rank.between(lastRank, null);
        out.rank = lastRank.toString();
      } else {
        lastRank = Rank.from(out.rank as string);
      }
      if (!out.id || typeof out.id !== "string") {
        // Deterministic id so repeated reads of the same (override-less) document
        // are idempotent. A random uuid here changes on every read — including the
        // unconditional watcher reconcile — which churns the React `key={item.id}`,
        // remounts list rows, and wipes any in-progress field edit. Seed the id from
        // the item's stable content + position; once the user edits, the value is
        // persisted to an override and read back verbatim.
        const { id: _id, rank: _rank, ...content } = out;
        out.id = `auto-${computeHash([index, content] as unknown as JsonValue)}`;
      }
      return out;
    });
  }
  return result;
}

// Build a fully-wired cache entry for (descriptor, scopeId): scoped paths,
// reloadValues, field-storage-provider load loop, and file watchers. Mirrors the
// base-entry construction in initRegistry — the only difference is the scope path
// segment threaded through userScopedDir. Returns the entry (also stored in cache).
async function buildEntry(
  descriptor: ConfigDescriptor,
  hierarchyPath: string,
  storePath: string,
  scopeId: string,
): Promise<CacheEntry> {
  const scopedDir = userScopedDir(hierarchyPath, scopeId || undefined);
  const userOriginPath = join(scopedDir, `${descriptor.name}.origin.jsonc`);
  const userOverwritesPath = join(scopedDir, `${descriptor.name}.jsonc`);
  const userAncestorPath = join(scopedDir, `${descriptor.name}.ancestor.jsonc`);

  const reloadValues = (): ConfigValues<FieldsRecord> => {
    const freshUserOrigin = jsoncConfigProxy(userOriginPath);
    const freshUserOverwrites = jsoncConfigProxy(userOverwritesPath);
    const raw = readTypedConfig(descriptor, freshUserOrigin, freshUserOverwrites);
    return injectCollectionIds(
      raw as Record<string, unknown>,
      descriptor.fields,
    ) as ConfigValues<FieldsRecord>;
  };

  const values = reloadValues();

  for (const [key, field] of Object.entries(descriptor.fields)) {
    const provider = getFieldStorageProvider(field.type.id);
    if (provider) {
      try {
        const result = await provider.load(descriptor.name, key);
        (values as Record<string, unknown>)[key] = result.value;
      } catch (err) {
        if (err instanceof Error && err.name === "SecretsMainOfflineError") {
          // Provider unavailable — keep JSONC default
        } else {
          throw err;
        }
      }
    }
  }

  const onFileChange = () => {
    const freshValues = reloadValues();
    const entry = getEntry(descriptor, scopeId);
    if (entry) {
      entry.values = freshValues;
    }

    const subs = subscribersByDescriptor.get(descriptor)?.get(scopeId);
    if (subs) {
      for (const cb of subs) cb(freshValues);
    }

    notifyValues(storePath, scopeId);
    notifyConflicts(storePath, scopeId);
    notifyTiers(storePath, scopeId);
    // A scoped origin/override file appearing or disappearing changes the
    // descriptor's customized-scope set. The scopes loader recomputes own-config
    // membership, so re-notify it keyed by storePath whenever a scoped file moves.
    if (scopeId) {
      configV2ScopesServerResource.notify({ path: storePath });
    }
  };

  const disposables: Disposable[] = [];
  disposables.push(watchFileChange(userOverwritesPath, onFileChange));
  disposables.push(watchFileChange(userOriginPath, onFileChange));

  const entry: CacheEntry = {
    scopeId,
    values,
    storePath,
    userOriginPath,
    userOverwritesPath,
    userAncestorPath,
    disposables,
  };

  let scopeMap = cacheByDescriptor.get(descriptor);
  if (!scopeMap) {
    scopeMap = new Map();
    cacheByDescriptor.set(descriptor, scopeMap);
  }
  scopeMap.set(scopeId, entry);

  if (scopeId) knownScopeIds.add(scopeId);

  return entry;
}

// Notify config values for a (storePath, scopeId) change. A BASE change also
// re-renders every currently-un-forked scope (they resolve base live), so emit a
// per-scope notify for each known scope without a forked entry. A scoped change
// targets only that scope.
function notifyValues(storePath: string, scopeId: string): void {
  // The modified-counts list is computed off effective BASE values across every
  // descriptor and keyed by `{}` (the whole map), so any value change can shift
  // it. Notify it once regardless of scope (a scoped-only change recomputes to
  // the same map — idempotent — so this never over- or under-fires).
  configV2ModifiedCountsServerResource.notify({});
  if (scopeId) {
    configV2ServerResource.notify({ path: storePath, scopeId });
    return;
  }
  configV2ServerResource.notify({ path: storePath });
  const descriptor = getDescriptorByStorePath(storePath);
  for (const sid of knownScopeIds) {
    if (descriptor && scopeHasOwnConfig(descriptor, sid)) continue;
    configV2ServerResource.notify({ path: storePath, scopeId: sid });
  }
}

function notifyTiers(storePath: string, scopeId: string): void {
  if (scopeId) {
    configV2TiersServerResource.notify({ path: storePath, scopeId });
    return;
  }
  configV2TiersServerResource.notify({ path: storePath });
  const descriptor = getDescriptorByStorePath(storePath);
  for (const sid of knownScopeIds) {
    if (descriptor && scopeHasOwnConfig(descriptor, sid)) continue;
    configV2TiersServerResource.notify({ path: storePath, scopeId: sid });
  }
}

// Notify the conflicts resource for a (storePath, scopeId) change. The conflicts
// loader is NOT per-path keyed — it returns the whole conflicts map — so the
// notify key is `{ scopeId }` (or `{}` for base), never per storePath. A scoped
// change re-notifies only that scope; a BASE change also re-notifies every known
// un-forked scope, which resolves base live (mirrors notifyValues/notifyTiers).
function notifyConflicts(storePath: string, scopeId: string): void {
  // The aggregate conflict-paths list spans base + every scope, so any conflict
  // change (base or scoped) can change it. Notify it once regardless of scope.
  configV2ConflictPathsServerResource.notify({});
  if (scopeId) {
    configV2ConflictsServerResource.notify({ scopeId });
    return;
  }
  configV2ConflictsServerResource.notify({});
  const descriptor = getDescriptorByStorePath(storePath);
  for (const sid of knownScopeIds) {
    if (descriptor && scopeHasOwnConfig(descriptor, sid)) continue;
    configV2ConflictsServerResource.notify({ scopeId: sid });
  }
}

// Fan out every read-resource notify for a (storePath, scopeId) change in one
// call. Used by the per-descriptor fork/remove primitives, whose file writes
// must surface immediately (rather than waiting on the debounced watcher), and
// which also change the descriptor's customized-scope set. Mirrors the fan-out
// the watcher's onFileChange performs.
export function notifyDescriptorScopeChange(storePath: string, scopeId: string): void {
  notifyValues(storePath, scopeId);
  notifyConflicts(storePath, scopeId);
  notifyTiers(storePath, scopeId);
  configV2ScopesServerResource.notify({ path: storePath });
}

function getEntry(descriptor: ConfigDescriptor, scopeId: string = BASE_SCOPE): CacheEntry | undefined {
  return cacheByDescriptor.get(descriptor)?.get(scopeId);
}

// A scope is "forked" when its scoped override file exists on disk — a USER fork.
// Drives only the theme "Customize for app" toggle (isScopeForked). An un-forked
// scope tracks base live.
function isForked(descriptor: ConfigDescriptor, scopeId: string): boolean {
  if (!scopeId) return false;
  const hierarchyPath = getHierarchyPath(descriptor);
  if (!hierarchyPath) return false;
  const scopedDir = userScopedDir(hierarchyPath, scopeId);
  const overwritesPath = join(scopedDir, `${descriptor.name}.jsonc`);
  return jsoncConfigProxy(overwritesPath).exists();
}

// Scope-level forked check: a scope is forked iff ANY of its `scope: "app"`
// descriptors has an override file on disk (fork writes the whole set together,
// so any one is sufficient). Used by the configV2ScopeForked read resource.
export function isScopeForked(scopeId: string): boolean {
  if (!scopeId) return false;
  for (const { descriptor } of getScopedDescriptors("app")) {
    if (isForked(descriptor, scopeId)) return true;
  }
  return false;
}

// Lazily build (and cache) a scoped entry for (descriptor, scopeId). The base
// entry is created in initRegistry; scoped entries don't exist until a fork writes
// files, so callers that need to write a scoped override go through here first.
export async function ensureScopeEntry(
  descriptor: ConfigDescriptor,
  scopeId: string,
): Promise<CacheEntry> {
  const existing = getEntry(descriptor, scopeId);
  if (existing) return existing;

  const hierarchyPath = getHierarchyPath(descriptor);
  if (!hierarchyPath) {
    throw new Error(
      `[config-v2] ensureScopeEntry: descriptor "${descriptor.name}" has no registered hierarchy path.`,
    );
  }
  const storePath = `${hierarchyPath}/${descriptor.name}.jsonc`;
  return buildEntry(descriptor, hierarchyPath, storePath, scopeId);
}

export async function initRegistry(): Promise<void> {
  try {
    setConfigGetter(getConfig);
    setScopeForkedChecker(isScopeForked);
    const contributions = ConfigV2.Register.getContributions();
    const registered: { descriptor: ConfigDescriptor; hierarchyPath: string }[] = [];

    for (const contribution of contributions) {
      const { descriptor } = contribution;
      // An explicit `pluginId` lets a plugin register a descriptor under a
      // *different* plugin's config tree; default to the registering plugin's own id.
      // Both are the canonical DOT-form PluginId. The on-disk store layout is slash
      // (`config/<slash>/`), so convert dot→slash here at the single boundary — the
      // resulting `hierarchyPath` value flows unchanged through every downstream
      // reader (registerDescriptorPath, getHierarchyPath, userScopedDir, scope-fork).
      const pluginId = contribution.pluginId ?? contribution._pluginId;
      if (!pluginId) {
        console.warn(
          `[config-v2] contribution for descriptor "${descriptor.name}" has no _pluginId — skipping`,
        );
        continue;
      }
      const hierarchyPath = asPath(asPluginId(pluginId));

      const storePath = `${hierarchyPath}/${descriptor.name}.jsonc`;
      registerDescriptorPath(storePath, descriptor, hierarchyPath);

      // Register only the BASE entry per descriptor (as today). Scoped entries are
      // created on demand by ensureScopeEntry once a fork writes their files.
      await buildEntry(descriptor, hierarchyPath, storePath, BASE_SCOPE);
      registered.push({ descriptor, hierarchyPath });
    }

    // Rehydrate scoped entries from disk. Scoped (per-app) entries are otherwise
    // only ever created lazily on fork/setConfig, so after a server restart none
    // exist — yet their files persist on disk (a propagated git scope's origin, or
    // a runtime fork's override). Without this the in-memory cache silently
    // disagrees with durable state: getConfig (which needs a live entry AND the
    // on-disk scope) falls back to base/global for an app with its own config, and
    // knownScopeIds stays empty so base-config changes stop notifying scoped apps.
    // Any registered descriptor can be git-scoped (a committed config/<hier>/@app/
    // file), not just `scope: "app"` ones — so iterate the full registered set.
    for (const { descriptor, hierarchyPath } of registered) {
      for (const scopeId of discoverScopeIds(hierarchyPath)) {
        if (scopeHasOwnConfig(descriptor, scopeId)) {
          await ensureScopeEntry(descriptor, scopeId);
        }
      }
    }
  } finally {
    // Open the readiness gate even if init threw partway through. Otherwise the
    // resource loader awaits registryReady forever and every config read hangs
    // app-wide on a loading spinner with no error surfaced. With the gate open,
    // already-registered descriptors resolve normally and any unregistered path
    // hits the loader's clear per-path throw (loud client error, not a hang).
    // The original error still propagates out of initRegistry (awaited in
    // onReady), so the boot failure remains loudly logged server-side.
    markRegistryReady();
  }
}

export function shutdownRegistry(): void {
  const contributions = ConfigV2.Register.getContributions();
  for (const contribution of contributions) {
    const { descriptor } = contribution;
    const scopeMap = cacheByDescriptor.get(descriptor);
    if (scopeMap) {
      for (const entry of scopeMap.values()) {
        for (const d of entry.disposables) d.dispose();
      }
      cacheByDescriptor.delete(descriptor);
    }
    subscribersByDescriptor.delete(descriptor);
  }
  knownScopeIds.clear();
}

// Dispose the watchers for a scoped entry and drop it from the cache. Used by
// deleteScope when un-forking — base entries are never disposed here.
export function disposeScopeEntry(descriptor: ConfigDescriptor, scopeId: string): void {
  if (!scopeId) return;
  const scopeMap = cacheByDescriptor.get(descriptor);
  const entry = scopeMap?.get(scopeId);
  if (entry) {
    for (const d of entry.disposables) d.dispose();
    scopeMap!.delete(scopeId);
  }
  subscribersByDescriptor.get(descriptor)?.delete(scopeId);
}

export function getConfig<F extends FieldsRecord>(
  descriptor: ConfigDescriptor<F>,
  scopeId: string = BASE_SCOPE,
): ConfigValues<F> {
  const base = getEntry(descriptor, BASE_SCOPE);
  if (!base) {
    throw new Error(
      `[config-v2] getConfig: descriptor "${descriptor.name}" is not registered or onReady has not completed.`,
    );
  }
  if (!scopeId) return base.values as ConfigValues<F>;

  // Scoped read: a scope with its own config (a propagated git scope OR a runtime
  // fork) returns its own values; an untracked scope tracks base LIVE.
  const scoped = getEntry(descriptor, scopeId);
  if (scoped && scopeHasOwnConfig(descriptor, scopeId)) {
    return scoped.values as ConfigValues<F>;
  }
  return base.values as ConfigValues<F>;
}

export async function setConfig<F extends FieldsRecord, K extends keyof F & string>(
  descriptor: ConfigDescriptor<F>,
  key: K,
  value: InferFieldValue<F[K]>,
  scopeId: string = BASE_SCOPE,
): Promise<void> {
  const entry = scopeId
    ? await ensureScopeEntry(descriptor, scopeId)
    : getEntry(descriptor, BASE_SCOPE);
  if (!entry) {
    throw new Error(
      `[config-v2] setConfig: descriptor "${descriptor.name}" is not registered or onReady has not completed.`,
    );
  }

  descriptor.fields[key]!.schema.parse(value);

  const provider = getFieldStorageProvider(descriptor.fields[key]!.type.id);
  if (provider) {
    (entry.values as Record<string, unknown>)[key] = value;
    await provider.save(descriptor.name, key, value as string);
    const subs = subscribersByDescriptor.get(descriptor)?.get(entry.scopeId);
    if (subs) {
      for (const cb of subs) cb(entry.values);
    }
    notifyValues(entry.storePath, entry.scopeId);
    return;
  }

  const userOverwrites = jsoncConfigProxy(entry.userOverwritesPath);
  const userOrigin = jsoncConfigProxy(entry.userOriginPath);

  // For a scoped write, fork-on-write keys off the BASE origin (the only thing we
  // can snapshot from). Read it off the base CacheEntry's userOriginPath — the
  // authoritative base-origin location for this descriptor.
  const baseOriginPath = getEntry(descriptor, BASE_SCOPE)?.userOriginPath;

  let base: Record<string, unknown>;
  let hash: string | null;

  if (userOverwrites.exists()) {
    const ow = userOverwrites.read()!;
    base = { ...(ow.content as Record<string, unknown>) };
    hash = ow.hash;
  } else if (userOrigin.exists()) {
    const orig = userOrigin.read()!;
    base = { ...(orig.content as Record<string, unknown>) };
    hash = computeHash(orig.content);
  } else if (scopeId && baseOriginPath && jsoncConfigProxy(baseOriginPath).exists()) {
    // FORK-ON-WRITE. The scope has no own config (neither scoped override nor
    // scoped origin), but the BASE origin exists — so this is a first scoped
    // write to an app that tracks base. Rather than throwing, auto-create the
    // scope by snapshotting base-effective values into the scoped origin (the
    // exact snapshot forkDescriptor writes, via the shared buildScopeSnapshot
    // helper), then fall through to the normal write path below: userOrigin now
    // exists, so the override is anchored against the freshly-written scoped
    // origin's hash. This makes a scoped write make the scope exist *and*
    // readable — fully symmetric with the read path, no fork ceremony.
    const hierarchyPath = getHierarchyPath(descriptor);
    if (!hierarchyPath) {
      throw new Error(
        `[config-v2] setConfig: descriptor "${descriptor.name}" has no registered hierarchy path.`,
      );
    }
    writeScopedOriginSnapshot(descriptor, hierarchyPath, scopeId);
    // Surface the scope-membership flip promptly (the config-v2.scopes resource)
    // rather than waiting on the ~100ms watcher debounce — mirrors
    // forkDescriptorScope. The override write below is picked up by the entry's
    // own watcher as today.
    notifyDescriptorScopeChange(entry.storePath, scopeId);
    const orig = userOrigin.read()!;
    base = { ...(orig.content as Record<string, unknown>) };
    hash = computeHash(orig.content);
  } else {
    // ./singularity build propagates a hashed origin for every registered
    // descriptor, so a missing origin here means the build never ran (or the
    // file was deleted). A base write with no origin — or a scoped write when
    // even the BASE origin is absent (the fork-on-write branch above can't fire,
    // since there is no base to snapshot) — both land here. Writing a hashless
    // override to paper over it would produce a corrupt file that conflict
    // detection can't anchor — fail loudly.
    throw new Error(
      `[config-v2] setConfig: no origin file for "${entry.storePath}" at ${entry.userOriginPath}. ` +
        `Run ./singularity build to propagate the config origin before setting overrides.`,
    );
  }

  base[key] = value;
  const injected = injectCollectionIds(base, descriptor.fields);
  userOverwrites.write(injected as JsonValue, hash);
}

export async function setConfigByPath(storePath: string, key: string, value: unknown, scopeId?: string): Promise<void> {
  const descriptor = getDescriptorByStorePath(storePath);
  if (!descriptor) throw new Error(`No descriptor for "${storePath}"`);
  await setConfig(descriptor, key as keyof typeof descriptor.fields & string, value as never, scopeId);
}

export async function resetConfigByPath(storePath: string, key: string, scopeId?: string): Promise<void> {
  const descriptor = getDescriptorByStorePath(storePath);
  if (!descriptor) throw new Error(`No descriptor for "${storePath}"`);

  const field = descriptor.fields[key];
  if (!field) throw new Error(`No field "${key}" in "${descriptor.name}"`);

  const provider = getFieldStorageProvider(field.type.id);
  if (provider) {
    await provider.clear(descriptor.name, key);
    const entry = getEntry(descriptor, scopeId ?? BASE_SCOPE);
    if (entry) {
      (entry.values as Record<string, unknown>)[key] = field.defaultValue;
      const subs = subscribersByDescriptor.get(descriptor)?.get(entry.scopeId);
      if (subs) {
        for (const cb of subs) cb(entry.values);
      }
      notifyValues(entry.storePath, entry.scopeId);
    }
    return;
  }

  const defaultValue = (descriptor.defaults as Record<string, unknown>)[key];
  if (defaultValue === undefined) throw new Error(`No field "${key}" in "${descriptor.name}"`);
  await setConfig(descriptor, key as keyof typeof descriptor.fields & string, defaultValue as never, scopeId);
}

export function watchConfig<F extends FieldsRecord>(
  descriptor: ConfigDescriptor<F>,
  cb: (values: ConfigValues<F>) => void,
  scopeId: string = BASE_SCOPE,
): Disposable {
  const entry = getEntry(descriptor, scopeId);
  if (!entry) {
    throw new Error(
      `[config-v2] watchConfig: descriptor "${descriptor.name}" (scope "${scopeId}") is not registered or onReady has not completed.`,
    );
  }

  let scopeSubs = subscribersByDescriptor.get(descriptor);
  if (!scopeSubs) {
    scopeSubs = new Map();
    subscribersByDescriptor.set(descriptor, scopeSubs);
  }
  let subs = scopeSubs.get(scopeId);
  if (!subs) {
    subs = new Set();
    scopeSubs.set(scopeId, subs);
  }

  const wrappedCb = cb as (values: ConfigValues<FieldsRecord>) => void;
  subs.add(wrappedCb);

  cb(entry.values as ConfigValues<F>);

  return {
    dispose: () => {
      subs!.delete(wrappedCb);
    },
  };
}

export function acknowledgeConflictByPath(storePath: string, scopeId?: string): void {
  const descriptor = getDescriptorByStorePath(storePath);
  if (!descriptor) throw new Error(`No descriptor for "${storePath}"`);

  const entry = getEntry(descriptor, scopeId ?? BASE_SCOPE);
  if (!entry) throw new Error(`No cache entry for "${storePath}"`);

  const userOverwrites = jsoncConfigProxy(entry.userOverwritesPath);
  const userOrigin = jsoncConfigProxy(entry.userOriginPath);

  if (!userOverwrites.exists()) throw new Error(`No override file for "${storePath}"`);
  const ow = userOverwrites.read();
  if (!ow) throw new Error(`Cannot read override for "${storePath}"`);

  const originData = userOrigin.read();
  if (!originData) throw new Error(`Cannot read origin for "${storePath}"`);

  const newHash = computeHash(originData.content);
  userOverwrites.write(ow.content, newHash);
  // Terminal resolution — the override now wins against the current origin, so
  // the merge base is no longer needed. A stale ancestor would seed a wrong
  // three-way merge on the next conflict.
  if (existsSync(entry.userAncestorPath)) unlinkSync(entry.userAncestorPath);
}

// Three-way merge resolution: reconcile a stale override against its origin
// using the ancestor snapshot propagate() captured. Fields only one side changed
// are auto-resolved; fields both sides changed differently are returned in
// `conflictKeys` (left as the user's value, tentatively). When nothing truly
// conflicts the override is rewritten against the current origin (resolved) and
// the ancestor dropped; otherwise the stale hash is kept so the conflict stays
// surfaced and re-running merge after the user resolves the remaining fields
// finalizes it (idempotent — the same conflictKeys recur until resolved).
export function mergeConflictByPath(
  storePath: string,
  scopeId?: string,
): { resolved: boolean; conflictKeys: string[] } {
  const descriptor = getDescriptorByStorePath(storePath);
  if (!descriptor) throw new Error(`No descriptor for "${storePath}"`);

  const entry = getEntry(descriptor, scopeId ?? BASE_SCOPE);
  if (!entry) throw new Error(`No cache entry for "${storePath}"`);

  const userOverwrites = jsoncConfigProxy(entry.userOverwritesPath);
  const userOrigin = jsoncConfigProxy(entry.userOriginPath);
  const userAncestor = jsoncConfigProxy(entry.userAncestorPath);

  if (!userAncestor.exists()) {
    throw new Error(`No ancestor snapshot for "${storePath}" — three-way merge unavailable`);
  }
  const ow = userOverwrites.read();
  if (!ow) throw new Error(`Cannot read override for "${storePath}"`);
  const originData = userOrigin.read();
  if (!originData) throw new Error(`Cannot read origin for "${storePath}"`);
  const base = userAncestor.read();
  if (!base) throw new Error(`Cannot read ancestor for "${storePath}"`);

  const { merged, conflicts } = threeWayMerge(
    base.content as Record<string, JsonValue>,
    ow.content as Record<string, JsonValue>,
    originData.content as Record<string, JsonValue>,
  );
  const injected = injectCollectionIds(merged, descriptor.fields);

  const resolved = conflicts.length === 0;
  const hash = resolved ? computeHash(originData.content) : ow.hash;
  userOverwrites.write(injected as JsonValue, hash);
  if (resolved && existsSync(entry.userAncestorPath)) unlinkSync(entry.userAncestorPath);

  return { resolved, conflictKeys: conflicts };
}

export function getRawFileContent(
  storePath: string,
  scopeId?: string,
): {
  override: string | null;
  overridePath: string;
  origin: string | null;
  originPath: string;
  gitOverride: string | null;
  gitOverridePath: string;
  gitOrigin: string | null;
  gitOriginPath: string;
} {
  const descriptor = getDescriptorByStorePath(storePath);
  if (!descriptor) throw new Error(`No descriptor for "${storePath}"`);

  const entry = getEntry(descriptor, scopeId ?? BASE_SCOPE);
  if (!entry) throw new Error(`No cache entry for "${storePath}"`);

  const readRaw = (path: string): string | null => {
    try {
      return readFileSync(path, "utf-8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
      return null;
    }
  };

  // Git-layer files live in the repo, not the per-worktree user dir. A scoped
  // override is expressed in git at config/<dir>/@app/<id>/<name>.jsonc, but its
  // origin anchor is always the BASE origin (config/<dir>/<name>.origin.jsonc) —
  // no scoped origin is ever committed. So the override path takes the scope
  // segment while the origin path stays base.
  const parts = storePath.replace(/\.jsonc$/, "").split("/");
  const dir = parts.slice(0, -1).join("/");
  const name = parts[parts.length - 1]!;
  const gitScopeSeg = scopeSegment(scopeId);
  const gitOverridePath = join(REPO_ROOT, "config", dir, gitScopeSeg, `${name}.jsonc`);
  const gitOriginPath = join(REPO_ROOT, "config", dir, `${name}.origin.jsonc`);

  // Paths are returned relative to their layer root (user config dir / repo root)
  // so the UI can label each section with a compact, non-wrapping location rather
  // than a noisy absolute path. The label already names the layer.
  return {
    override: readRaw(entry.userOverwritesPath),
    overridePath: relative(CONFIG_DIR, entry.userOverwritesPath),
    origin: readRaw(entry.userOriginPath),
    originPath: relative(CONFIG_DIR, entry.userOriginPath),
    gitOverride: readRaw(gitOverridePath),
    gitOverridePath: relative(REPO_ROOT, gitOverridePath),
    gitOrigin: readRaw(gitOriginPath),
    gitOriginPath: relative(REPO_ROOT, gitOriginPath),
  };
}

export function deleteOverrideByPath(storePath: string, scopeId?: string): void {
  const descriptor = getDescriptorByStorePath(storePath);
  if (!descriptor) throw new Error(`No descriptor for "${storePath}"`);

  const entry = getEntry(descriptor, scopeId ?? BASE_SCOPE);
  if (!entry) throw new Error(`No cache entry for "${storePath}"`);

  // Idempotent: an "invalid" conflict can surface with no override on disk
  // (the origin itself fails the current schema). Deleting a non-existent
  // override is a no-op — defaults are already in effect.
  if (existsSync(entry.userOverwritesPath)) unlinkSync(entry.userOverwritesPath);
  // The override is gone, so any captured merge base is moot — drop it.
  if (existsSync(entry.userAncestorPath)) unlinkSync(entry.userAncestorPath);
}
