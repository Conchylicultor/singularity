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
import { CONFIG_DIR } from "./config-dir";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { watchFileChange } from "./config-watcher";
import { ConfigV2 } from "./contribution";
import { configV2ServerResource, configV2ConflictsServerResource, configV2TiersServerResource, getDescriptorByStorePath, registerDescriptorPath, setConfigGetter } from "./resource";
import { getFieldStorageProvider } from "./field-storage-providers";

interface CacheEntry {
  values: ConfigValues<FieldsRecord>;
  storePath: string;
  userOriginPath: string;
  userOverwritesPath: string;
  disposables: Disposable[];
}

const cacheByDescriptor = new WeakMap<ConfigDescriptor, CacheEntry>();
const subscribersByDescriptor = new WeakMap<ConfigDescriptor, Set<(values: ConfigValues<FieldsRecord>) => void>>();

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

export async function initRegistry(): Promise<void> {
  setConfigGetter(getConfig);
  const contributions = ConfigV2.Register.getContributions();

  for (const contribution of contributions) {
    const { descriptor } = contribution;
    const hierarchyPath = contribution._hierarchyPath;
    if (!hierarchyPath) {
      console.warn(
        `[config-v2] contribution from plugin "${contribution._pluginId}" has no _hierarchyPath — skipping`,
      );
      continue;
    }

    const storePath = `${hierarchyPath}/${descriptor.name}.jsonc`;
    registerDescriptorPath(storePath, descriptor);

    const userOriginPath = join(CONFIG_DIR, hierarchyPath, `${descriptor.name}.origin.jsonc`);
    const userOverwritesPath = join(CONFIG_DIR, hierarchyPath, `${descriptor.name}.jsonc`);

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
      const entry = cacheByDescriptor.get(descriptor);
      if (entry) {
        entry.values = freshValues;
      }

      const subs = subscribersByDescriptor.get(descriptor);
      if (subs) {
        for (const cb of subs) cb(freshValues);
      }

      configV2ServerResource.notify({ path: storePath });
      configV2ConflictsServerResource.notify();
      configV2TiersServerResource.notify({ path: storePath });
    };

    const disposables: Disposable[] = [];
    disposables.push(watchFileChange(userOverwritesPath, onFileChange));
    disposables.push(watchFileChange(userOriginPath, onFileChange));

    cacheByDescriptor.set(descriptor, {
      values,
      storePath,
      userOriginPath,
      userOverwritesPath,
      disposables,
    });
  }
}

export function shutdownRegistry(): void {
  const contributions = ConfigV2.Register.getContributions();
  for (const contribution of contributions) {
    const { descriptor } = contribution;
    const entry = cacheByDescriptor.get(descriptor);
    if (entry) {
      for (const d of entry.disposables) d.dispose();
      cacheByDescriptor.delete(descriptor);
    }
    subscribersByDescriptor.delete(descriptor);
  }
}

export function getConfig<F extends FieldsRecord>(descriptor: ConfigDescriptor<F>): ConfigValues<F> {
  const entry = cacheByDescriptor.get(descriptor);
  if (!entry) {
    throw new Error(
      `[config-v2] getConfig: descriptor "${descriptor.name}" is not registered or onReady has not completed.`,
    );
  }
  return entry.values as ConfigValues<F>;
}

export async function setConfig<F extends FieldsRecord, K extends keyof F & string>(
  descriptor: ConfigDescriptor<F>,
  key: K,
  value: InferFieldValue<F[K]>,
): Promise<void> {
  const entry = cacheByDescriptor.get(descriptor);
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
    const subs = subscribersByDescriptor.get(descriptor);
    if (subs) {
      for (const cb of subs) cb(entry.values);
    }
    configV2ServerResource.notify({ path: entry.storePath });
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
    base = { ...(descriptor.defaults as Record<string, unknown>) };
    hash = null;
  }

  base[key] = value;
  const injected = injectCollectionIds(base, descriptor.fields);
  userOverwrites.write(injected as JsonValue, hash);
}

export async function setConfigByPath(storePath: string, key: string, value: unknown): Promise<void> {
  const descriptor = getDescriptorByStorePath(storePath);
  if (!descriptor) throw new Error(`No descriptor for "${storePath}"`);
  await setConfig(descriptor, key as keyof typeof descriptor.fields & string, value as never);
}

export async function resetConfigByPath(storePath: string, key: string): Promise<void> {
  const descriptor = getDescriptorByStorePath(storePath);
  if (!descriptor) throw new Error(`No descriptor for "${storePath}"`);

  const field = descriptor.fields[key];
  if (!field) throw new Error(`No field "${key}" in "${descriptor.name}"`);

  const provider = getFieldStorageProvider(field.type.id);
  if (provider) {
    await provider.clear(descriptor.name, key);
    const entry = cacheByDescriptor.get(descriptor);
    if (entry) {
      (entry.values as Record<string, unknown>)[key] = field.defaultValue;
      const subs = subscribersByDescriptor.get(descriptor);
      if (subs) {
        for (const cb of subs) cb(entry.values);
      }
      configV2ServerResource.notify({ path: entry.storePath });
    }
    return;
  }

  const defaultValue = (descriptor.defaults as Record<string, unknown>)[key];
  if (defaultValue === undefined) throw new Error(`No field "${key}" in "${descriptor.name}"`);
  await setConfig(descriptor, key as keyof typeof descriptor.fields & string, defaultValue as never);
}

export function watchConfig<F extends FieldsRecord>(
  descriptor: ConfigDescriptor<F>,
  cb: (values: ConfigValues<F>) => void,
): Disposable {
  const entry = cacheByDescriptor.get(descriptor);
  if (!entry) {
    throw new Error(
      `[config-v2] watchConfig: descriptor "${descriptor.name}" is not registered or onReady has not completed.`,
    );
  }

  let subs = subscribersByDescriptor.get(descriptor);
  if (!subs) {
    subs = new Set();
    subscribersByDescriptor.set(descriptor, subs);
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

export function acknowledgeConflictByPath(storePath: string): void {
  const descriptor = getDescriptorByStorePath(storePath);
  if (!descriptor) throw new Error(`No descriptor for "${storePath}"`);

  const entry = cacheByDescriptor.get(descriptor);
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

export function getRawFileContent(storePath: string): { origin: string | null; override: string | null } {
  const descriptor = getDescriptorByStorePath(storePath);
  if (!descriptor) throw new Error(`No descriptor for "${storePath}"`);

  const entry = cacheByDescriptor.get(descriptor);
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

export function deleteOverrideByPath(storePath: string): void {
  const descriptor = getDescriptorByStorePath(storePath);
  if (!descriptor) throw new Error(`No descriptor for "${storePath}"`);

  const entry = cacheByDescriptor.get(descriptor);
  if (!entry) throw new Error(`No cache entry for "${storePath}"`);

  unlinkSync(entry.userOverwritesPath);
}
