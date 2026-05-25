import { join } from "node:path";
import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { configV2ValuesSchema, configV2ConflictsSchema, configV2TiersSchema, hasConflict } from "../../core";
import type { ConfigV2Values, ConfigV2Conflicts, ConfigV2Tiers } from "../../core";
import type { ConfigDescriptor, ConfigValues, FieldsRecord, JsonValue } from "../../core";
import { CONFIG_DIR } from "./config-dir";
import { jsoncConfigProxy } from "./jsonc-proxy";
import { hasFieldStorageProvider } from "./field-storage-providers";

type ConfigGetter = <F extends FieldsRecord>(d: ConfigDescriptor<F>) => ConfigValues<F>;

const descriptorByPath = new Map<string, ConfigDescriptor>();
let configGetter: ConfigGetter | null = null;

export const configV2ServerResource = defineResource<ConfigV2Values, { path: string }>({
  key: "config-v2.values",
  mode: "push",
  schema: configV2ValuesSchema,
  loader: ({ path }) => {
    const descriptor = descriptorByPath.get(path);
    if (!descriptor || !configGetter) return {};
    const values = configGetter(descriptor) as ConfigV2Values;
    const redacted = { ...values };
    for (const [key, field] of Object.entries(descriptor.fields)) {
      if (hasFieldStorageProvider(field.type.id)) {
        redacted[key] = field.defaultValue;
      }
    }
    return redacted;
  },
});

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
      conflicts[storePath] = { originValues };
    }
  }
  return conflicts;
}

export const configV2ConflictsServerResource = defineResource<ConfigV2Conflicts>({
  key: "config-v2.conflicts",
  mode: "push",
  schema: configV2ConflictsSchema,
  loader: () => computeAllConflicts(),
});

export function registerDescriptorPath(path: string, descriptor: ConfigDescriptor): void {
  descriptorByPath.set(path, descriptor);
}

export function getDescriptorByStorePath(path: string): ConfigDescriptor | undefined {
  return descriptorByPath.get(path);
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

function computeTiers(path: string): ConfigV2Tiers {
  const descriptor = descriptorByPath.get(path);
  if (!descriptor) return {};

  const parts = path.replace(/\.jsonc$/, "").split("/");
  const dir = parts.slice(0, -1).join("/");
  const name = parts[parts.length - 1]!;

  const originPath = join(CONFIG_DIR, dir, `${name}.origin.jsonc`);
  const overridePath = join(CONFIG_DIR, dir, `${name}.jsonc`);

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

export const configV2TiersServerResource = defineResource<ConfigV2Tiers, { path: string }>({
  key: "config-v2.tiers",
  mode: "push",
  schema: configV2TiersSchema,
  loader: ({ path }) => computeTiers(path),
});

export function getAllDescriptors(): [string, ConfigDescriptor][] {
  return [...descriptorByPath.entries()];
}
