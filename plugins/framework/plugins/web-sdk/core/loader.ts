import type { LoadedPlugin, PluginDefinition } from "./types";

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
): Promise<{ plugins: LoadedPlugin[]; errors: PluginLoadError[] }> {
  const results = await Promise.allSettled(
    entries.map((e) => e.loader()),
  );
  const plugins: LoadedPlugin[] = [];
  const errors: PluginLoadError[] = [];
  const seenIds = new Set<string>();
  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    const entry = entries[i]!;
    if (result.status === "fulfilled") {
      // `id` is derived from the unique hierarchy path, never authored. The
      // duplicate guard is structurally unreachable (directory paths can't
      // collide) but fails loud if codegen ever regresses, rather than letting
      // one plugin silently drop the other during topo sort.
      const id = entry.hierarchyPath ?? entry.pluginPath;
      if (seenIds.has(id)) {
        throw new Error(
          `[plugin] duplicate derived plugin id "${id}" (${entry.pluginPath}) — two plugins resolve to the same hierarchy path`,
        );
      }
      seenIds.add(id);
      const plugin = result.value.default as PluginDefinition as LoadedPlugin;
      plugin.id = id;
      plugins.push(plugin);
    } else {
      console.error(`[plugin.${entry.pluginPath}] failed to load`, result.reason);
      errors.push({ pluginPath: entry.pluginPath, error: result.reason });
    }
  }
  return { plugins, errors };
}
