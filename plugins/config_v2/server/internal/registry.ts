import { join } from "node:path";
import type {
  ConfigDescriptor,
  ConfigValues,
  FieldsRecord,
  InferFieldValue,
} from "../../core";
import {
  readonlyProxy,
  computeHash,
  effective,
  propagate,
  readTypedConfig,
} from "../../core";
import { jsoncConfigProxy } from "./jsonc-proxy";
import type { Disposable, JsonValue } from "../../core";
import { REPO_ROOT, CONFIG_DIR } from "@plugins/infra/plugins/paths/server";
import { Rank } from "@plugins/primitives/plugins/rank/core";
import { watchFileChange } from "./config-watcher";
import { ConfigV2 } from "./contribution";
import { configV2ServerResource, getDescriptorByStorePath, registerDescriptorPath, setConfigGetter } from "./resource";

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
    result[key] = arr.map((item: Record<string, unknown>) => {
      const out = { ...item };
      if (!out.id || typeof out.id !== "string") {
        out.id = crypto.randomUUID();
      }
      if (!out.rank || typeof out.rank !== "string") {
        lastRank = Rank.between(lastRank, null);
        out.rank = lastRank.toString();
      } else {
        lastRank = Rank.from(out.rank as string);
      }
      return out;
    });
  }
  return result;
}

export function initRegistry(): void {
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

    const gitOrigin = jsoncConfigProxy(join(REPO_ROOT, "config", hierarchyPath, `${descriptor.name}.origin.jsonc`));
    const gitOverwrites = jsoncConfigProxy(join(REPO_ROOT, "config", hierarchyPath, `${descriptor.name}.jsonc`));

    const gitEff = effective(gitOrigin, gitOverwrites);
    const gitEffProxy = readonlyProxy(gitEff);
    const userOrigin = jsoncConfigProxy(userOriginPath);
    const userOverwrites = jsoncConfigProxy(userOverwritesPath);

    const { conflict } = propagate(gitEffProxy, userOrigin, userOverwrites);
    if (conflict) {
      console.warn(
        `[config-v2] conflict: user overwrites for "${descriptor.name}" at ${hierarchyPath} ` +
        `were based on a different upstream. Review ${userOverwritesPath}`,
      );
    }

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

export function setConfig<F extends FieldsRecord, K extends keyof F & string>(
  descriptor: ConfigDescriptor<F>,
  key: K,
  value: InferFieldValue<F[K]>,
): void {
  const entry = cacheByDescriptor.get(descriptor);
  if (!entry) {
    throw new Error(
      `[config-v2] setConfig: descriptor "${descriptor.name}" is not registered or onReady has not completed.`,
    );
  }

  descriptor.fields[key]!.schema.parse(value);

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

export function setConfigByPath(storePath: string, key: string, value: unknown): void {
  const descriptor = getDescriptorByStorePath(storePath);
  if (!descriptor) throw new Error(`No descriptor for "${storePath}"`);
  setConfig(descriptor, key as keyof typeof descriptor.fields & string, value as never);
}

export function resetConfigByPath(storePath: string, key: string): void {
  const descriptor = getDescriptorByStorePath(storePath);
  if (!descriptor) throw new Error(`No descriptor for "${storePath}"`);
  const defaultValue = (descriptor.defaults as Record<string, unknown>)[key];
  if (defaultValue === undefined) throw new Error(`No field "${key}" in "${descriptor.name}"`);
  setConfig(descriptor, key as keyof typeof descriptor.fields & string, defaultValue as never);
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
