import type {
  ConfigDescriptor,
  ConfigValues,
  FieldsRecord,
  FieldDef,
  InferFieldValue,
} from "../../core";
import type { Disposable, JsonValue } from "@plugins/config_v2/plugins/store/core";
import { getConfigStore } from "@plugins/config_v2/plugins/store/server";
import { ConfigV2 } from "./contribution";

interface CacheEntry {
  values: ConfigValues<FieldsRecord>;
  storePath: string;
  storeDisposable: Disposable;
}

const cacheByDescriptor = new WeakMap<ConfigDescriptor, CacheEntry>();
const subscribersByDescriptor = new WeakMap<ConfigDescriptor, Set<(values: ConfigValues<FieldsRecord>) => void>>();

function parseDocument(
  raw: JsonValue | undefined,
  descriptor: ConfigDescriptor,
): ConfigValues<FieldsRecord> {
  if (raw === undefined || raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...descriptor.defaults };
  }

  const doc = raw as Record<string, JsonValue>;
  const result: Record<string, unknown> = {};

  for (const [key, field] of Object.entries(descriptor.fields) as [string, FieldDef][]) {
    if (!(key in doc)) {
      result[key] = field.defaultValue;
      continue;
    }
    const parsed = field.schema.safeParse(doc[key]);
    result[key] = parsed.success ? parsed.data : field.defaultValue;
  }

  return result as ConfigValues<FieldsRecord>;
}

function injectCollectionIds(
  doc: Record<string, unknown>,
  _fields: FieldsRecord,
): Record<string, unknown> {
  // No-op until listField is implemented
  return doc;
}

export async function initRegistry(): Promise<void> {
  const contributions = ConfigV2.Register.getContributions();
  const readyPromises: Promise<void>[] = [];

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

    let resolveReady: () => void;
    const readyPromise = new Promise<void>((resolve) => {
      resolveReady = resolve;
    });
    readyPromises.push(readyPromise);

    let firstFire = true;

    const storeDisposable = getConfigStore().watch(storePath, (raw) => {
      const values = parseDocument(raw, descriptor);
      const entry = cacheByDescriptor.get(descriptor);
      if (entry) {
        entry.values = values;
      } else {
        cacheByDescriptor.set(descriptor, { values, storePath, storeDisposable });
      }

      const subs = subscribersByDescriptor.get(descriptor);
      if (subs) {
        for (const cb of subs) cb(values);
      }

      if (firstFire) {
        firstFire = false;
        resolveReady!();
      }
    });

    if (!cacheByDescriptor.has(descriptor)) {
      cacheByDescriptor.set(descriptor, { values: descriptor.defaults, storePath, storeDisposable });
    }
  }

  await Promise.all(readyPromises);
}

export function shutdownRegistry(): void {
  const contributions = ConfigV2.Register.getContributions();
  for (const contribution of contributions) {
    const { descriptor } = contribution;
    const entry = cacheByDescriptor.get(descriptor);
    if (entry) {
      entry.storeDisposable.dispose();
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

  const doc = { ...entry.values, [key]: value } as Record<string, unknown>;
  const injected = injectCollectionIds(doc, descriptor.fields);

  await getConfigStore().write(entry.storePath, injected as JsonValue);
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
