import type { PluginDefinition } from "./types";

export interface PluginEntry {
  name: string;
  loader: () => Promise<{ default: PluginDefinition }>;
}

export interface PluginLoadError {
  name: string;
  error: unknown;
}

export async function loadPlugins(
  entries: PluginEntry[],
): Promise<{ plugins: PluginDefinition[]; errors: PluginLoadError[] }> {
  const results = await Promise.allSettled(
    entries.map((e) => e.loader()),
  );
  const plugins: PluginDefinition[] = [];
  const errors: PluginLoadError[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    const entry = entries[i]!;
    if (result.status === "fulfilled") {
      plugins.push(result.value.default);
    } else {
      console.error(`[plugin.${entry.name}] failed to load`, result.reason);
      errors.push({ name: entry.name, error: result.reason });
    }
  }
  return { plugins, errors };
}
