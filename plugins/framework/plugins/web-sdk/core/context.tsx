import { createContext, useMemo, type ReactNode } from "react";
import { topoSortPlugins } from "./topo";
import type { Contribution, PluginDefinition } from "./types";

export interface PluginRuntime {
  plugins: PluginDefinition[];
  contributions: Contribution[];
  bySlot: Map<string, Contribution[]>;
}

export const PluginRuntimeContext = createContext<PluginRuntime | null>(null);

// Tracks plugins whose `register` array has been applied so a remount of
// PluginProvider (or a useMemo recompute) doesn't double-invoke registry
// writes.
const registered = new WeakSet<PluginDefinition>();

function runRegisterPhase(plugins: PluginDefinition[]): PluginDefinition[] {
  const ordered = topoSortPlugins(plugins);
  for (const p of ordered) {
    if (registered.has(p)) continue;
    registered.add(p);
    for (const r of p.register ?? []) {
      try {
        const result = r.register();
        // Web register is contractually sync; if a Promise sneaks through
        // (mistyped helper), surface the rejection rather than letting it
        // dangle silently.
        if (result instanceof Promise) {
          // eslint-disable-next-line promise-safety/no-bare-catch
          result.catch((err) =>
            console.error(`[plugin.${p.id}] register failed`, err),
          );
        }
      // eslint-disable-next-line promise-safety/no-bare-catch
      } catch (err) {
        console.error(`[plugin.${p.id}] register failed`, err);
      }
    }
  }
  return ordered;
}

export function PluginProvider({
  plugins,
  children,
}: {
  plugins: PluginDefinition[];
  children: ReactNode;
}) {
  const runtime = useMemo(() => {
    const ordered = runRegisterPhase(plugins);
    const contributions = ordered.flatMap((p) =>
      (p.contributions ?? []).map((c) => ({
        ...c,
        _pluginId: p.id,
        _pluginName: p.name,
        _pluginDescription: p.description,
        _hierarchyPath: p._hierarchyPath,
      })),
    );
    const bySlot = new Map<string, Contribution[]>();
    for (const c of contributions) {
      let list = bySlot.get(c._slotId);
      if (!list) {
        list = [];
        bySlot.set(c._slotId, list);
      }
      list.push(c);
    }
    return { plugins, contributions, bySlot };
  }, [plugins]);

  return (
    <PluginRuntimeContext.Provider value={runtime}>
      {children}
    </PluginRuntimeContext.Provider>
  );
}
