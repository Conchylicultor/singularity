import { readFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type {
  ConfigDescriptor,
  ConfigValues,
  FieldsRecord,
  InferFieldValue,
} from "../../core";
import {
  computeHash,
  readTypedConfig,
} from "../../core";
import { jsoncConfigProxy } from "./jsonc-proxy";
import type { Disposable, JsonValue } from "../../core";
import { userScopedDir, BASE_SCOPE } from "./scope-paths";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { watchFileChange } from "./config-watcher";
import { ConfigV2 } from "./contribution";
import { configV2ServerResource, configV2ConflictsServerResource, configV2TiersServerResource, getDescriptorByStorePath, getHierarchyPath, getScopedDescriptors, registerDescriptorPath, setConfigGetter, setScopeForkedChecker } from "./resource";
import { getFieldStorageProvider } from "./field-storage-providers";

interface CacheEntry {
  scopeId: string;
  values: ConfigValues<FieldsRecord>;
  storePath: string;
  userOriginPath: string;
  userOverwritesPath: string;
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
    configV2ConflictsServerResource.notify();
    notifyTiers(storePath, scopeId);
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
  if (scopeId) {
    configV2ServerResource.notify({ path: storePath, scopeId });
    return;
  }
  configV2ServerResource.notify({ path: storePath });
  const descriptor = getDescriptorByStorePath(storePath);
  for (const sid of knownScopeIds) {
    if (descriptor && isForked(descriptor, sid)) continue;
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
    if (descriptor && isForked(descriptor, sid)) continue;
    configV2TiersServerResource.notify({ path: storePath, scopeId: sid });
  }
}

function getEntry(descriptor: ConfigDescriptor, scopeId: string = BASE_SCOPE): CacheEntry | undefined {
  return cacheByDescriptor.get(descriptor)?.get(scopeId);
}

// A scope is "forked" when its scoped override file exists on disk. An un-forked
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
  setConfigGetter(getConfig);
  setScopeForkedChecker(isScopeForked);
  const contributions = ConfigV2.Register.getContributions();

  for (const contribution of contributions) {
    const { descriptor } = contribution;
    const pluginId = contribution._pluginId;
    if (!pluginId) {
      console.warn(
        `[config-v2] contribution for descriptor "${descriptor.name}" has no _pluginId — skipping`,
      );
      continue;
    }

    const storePath = `${pluginId}/${descriptor.name}.jsonc`;
    registerDescriptorPath(storePath, descriptor, pluginId);

    // Register only the BASE entry per descriptor (as today). Scoped entries are
    // created on demand by ensureScopeEntry once a fork writes their files.
    await buildEntry(descriptor, pluginId, storePath, BASE_SCOPE);
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

  // Scoped read: a forked scope (its @app/<id> override file exists on disk)
  // returns its own values; an un-forked scope tracks base LIVE.
  const scoped = getEntry(descriptor, scopeId);
  if (scoped && isForked(descriptor, scopeId)) {
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
  } else {
    // ./singularity build propagates a hashed origin for every registered
    // descriptor, so a missing origin here means the build never ran (or the
    // file was deleted). For app-scoped writes the origin is created by the fork
    // operation — a write before forking correctly throws here. Writing a
    // hashless override to paper over it would produce a corrupt file that
    // conflict detection can't anchor — fail loudly.
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
}

export function getRawFileContent(storePath: string, scopeId?: string): { origin: string | null; override: string | null } {
  const descriptor = getDescriptorByStorePath(storePath);
  if (!descriptor) throw new Error(`No descriptor for "${storePath}"`);

  const entry = getEntry(descriptor, scopeId ?? BASE_SCOPE);
  if (!entry) throw new Error(`No cache entry for "${storePath}"`);

  const readRaw = (path: string): string | null => {
    try {
      return readFileSync(path, "utf-8");
    } catch {
      return null;
    }
  };

  return {
    origin: readRaw(entry.userOriginPath),
    override: readRaw(entry.userOverwritesPath),
  };
}

export function deleteOverrideByPath(storePath: string, scopeId?: string): void {
  const descriptor = getDescriptorByStorePath(storePath);
  if (!descriptor) throw new Error(`No descriptor for "${storePath}"`);

  const entry = getEntry(descriptor, scopeId ?? BASE_SCOPE);
  if (!entry) throw new Error(`No cache entry for "${storePath}"`);

  unlinkSync(entry.userOverwritesPath);
}
