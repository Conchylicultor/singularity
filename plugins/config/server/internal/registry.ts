import type {
  ConfigDescriptor,
  NormalizedField,
  Schema,
} from "@plugins/config/shared";
import { fullKey, normalize } from "@plugins/config/shared";
import { Config } from "./contribution";

export interface RegisteredPlugin {
  pluginId: string;
  pluginName: string;
  pluginDescription?: string;
  fields: NormalizedField[];
}

let registry: RegisteredPlugin[] | null = null;
let byFullKey: Map<string, NormalizedField> | null = null;
const schemaToPluginId = new WeakMap<Schema, string>();

/**
 * Build (or rebuild) the server-side config registry from contributions.
 * Called once from the config plugin's `onReady` — later plugin mutations
 * require a restart, consistent with the rest of the server plugin system.
 */
export function buildRegistry(): void {
  const contributions = Config.Field.getContributions();
  const out: RegisteredPlugin[] = [];
  const keys = new Map<string, NormalizedField>();
  for (const c of contributions) {
    if (!c._pluginId) continue;
    schemaToPluginId.set(c.schema, c._pluginId);
    const fields = normalize(c.schema);
    if (fields.length === 0) continue;
    for (const f of fields) {
      const fk = fullKey(c._pluginId, f.key);
      if (keys.has(fk)) {
        // biome-ignore lint/suspicious/noConsole: misconfiguration surfaced at boot.
        console.warn(`[config] duplicate full-key "${fk}" — later plugin wins.`);
      }
      keys.set(fk, f);
    }
    out.push({
      pluginId: c._pluginId,
      pluginName: c._pluginName ?? c._pluginId,
      pluginDescription: c._pluginDescription,
      fields,
    });
  }
  registry = out;
  byFullKey = keys;
}

export function getRegistry(): RegisteredPlugin[] {
  return registry ?? [];
}

export function getField(fk: string): NormalizedField | undefined {
  return byFullKey?.get(fk);
}

export function pluginIdOf(descriptor: ConfigDescriptor): string | undefined {
  return schemaToPluginId.get(descriptor.schema);
}
