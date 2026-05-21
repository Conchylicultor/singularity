import { defineResource } from "@plugins/framework/plugins/server-core/core";
import { configV2ValuesSchema } from "../../core";
import type { ConfigV2Values } from "../../core";
import type { ConfigDescriptor, ConfigValues, FieldsRecord } from "../../core";

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
    return configGetter(descriptor) as ConfigV2Values;
  },
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
