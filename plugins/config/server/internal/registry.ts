import type {
  ConfigDescriptor,
  NormalizedField,
  Schema,
} from "@plugins/config/shared";
import { fullKey, normalize } from "@plugins/config/shared";

export interface RegisteredPlugin {
  pluginId: string;
  pluginName: string;
  pluginDescription?: string;
  fields: NormalizedField[];
}

let registry: RegisteredPlugin[] | null = null;
let byFullKey: Map<string, NormalizedField> | null = null;
// biome-ignore lint/suspicious/noExplicitAny: descriptor objects are erased here.
const descriptorToPluginId = new WeakMap<ConfigDescriptor<any>, string>();

/**
 * Build (or rebuild) the server-side config registry from the loaded plugin
 * list. Called once from the config plugin's `onReady` — later plugin mutations
 * require a restart, consistent with the rest of the server plugin system.
 */
export function buildRegistry(
  plugins: ReadonlyArray<{
    id: string;
    name: string;
    description?: string;
    config?: { schema: Schema };
  }>,
): void {
  const out: RegisteredPlugin[] = [];
  const keys = new Map<string, NormalizedField>();
  for (const p of plugins) {
    if (!p.config) continue;
    const descriptor = p.config as ConfigDescriptor;
    descriptorToPluginId.set(descriptor, p.id);
    const fields = normalize(descriptor.schema);
    if (fields.length === 0) continue;
    for (const f of fields) {
      const fk = fullKey(p.id, f.key);
      if (keys.has(fk)) {
        // biome-ignore lint/suspicious/noConsole: misconfiguration surfaced at boot.
        console.warn(`[config] duplicate full-key "${fk}" — later plugin wins.`);
      }
      keys.set(fk, f);
    }
    out.push({
      pluginId: p.id,
      pluginName: p.name,
      pluginDescription: p.description,
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
  return descriptorToPluginId.get(descriptor);
}
