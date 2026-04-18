import { createContext, useMemo, type ReactNode } from "react";
import type { Contribution, PluginDefinition } from "./types";

export interface PluginRuntime {
  plugins: PluginDefinition[];
  contributions: Contribution[];
  bySlot: Map<string, Contribution[]>;
}

export const PluginRuntimeContext = createContext<PluginRuntime | null>(null);

export function PluginProvider({
  plugins,
  children,
}: {
  plugins: PluginDefinition[];
  children: ReactNode;
}) {
  const runtime = useMemo(() => {
    const contributions = plugins.flatMap((p) =>
      (p.contributions ?? []).map((c) => ({
        ...c,
        _pluginId: p.id,
        _pluginName: p.name,
        _pluginDescription: p.description,
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
