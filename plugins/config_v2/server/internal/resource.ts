import { join } from "node:path";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { configV2ValuesSchema, configV2ConflictsSchema, configV2TiersSchema, configV2ScopeForkedSchema, hasConflict } from "../../core";
import type { ConfigV2Values, ConfigV2Conflicts, ConfigV2Tiers, ConfigV2ScopeForked } from "../../core";
import type { ConfigDescriptor, ConfigValues, FieldsRecord, JsonValue } from "../../core";
import { CONFIG_DIR } from "./config-dir";
import { userScopedDir } from "./scope-paths";
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
  for (const [path, descriptor] of descriptorByPath) {
    global[path] = resolveRedactedConfig(descriptor);
  }
  return { global };
}

function computeAllConflicts(): ConfigV2Conflicts {
  const conflicts: ConfigV2Conflicts = {};
  for (const [storePath, descriptor] of descriptorByPath) {
    const parts = storePath.replace(/\.jsonc$/, "").split("/");
    const dir = parts.slice(0, -1).join("/");
    const name = parts[parts.length - 1]!;

    const userOriginPath = join(CONFIG_DIR, dir, `${name}.origin.jsonc`);
    const userOverwritesPath = join(CONFIG_DIR, dir, `${name}.jsonc`);

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
      conflicts[storePath] = { originValues, overrideValues };
    }
  }
  return conflicts;
}

export const configV2ConflictsServerResource = defineResource<ConfigV2Conflicts>({
  key: "config-v2.conflicts",
  mode: "push",
  schema: configV2ConflictsSchema,
  loader: whenRegistryReady(() => computeAllConflicts()),
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
