import type { PluginDefinition } from "./types";

export interface PluginEntry {
  pluginPath: string;
  hierarchyPath?: string;
  loader: () => Promise<{ default: unknown }>;
}

export interface PluginLoadError {
  pluginPath: string;
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
      const plugin = result.value.default as PluginDefinition;
      if (entry.hierarchyPath) plugin._hierarchyPath = entry.hierarchyPath;
      plugins.push(plugin);
    } else {
      console.error(`[plugin.${entry.pluginPath}] failed to load`, result.reason);
      errors.push({ pluginPath: entry.pluginPath, error: result.reason });
    }
  }
  return { plugins, errors };
}
