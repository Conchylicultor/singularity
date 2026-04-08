import { createContext, useMemo, type ReactNode } from "react";
import type { Contribution, PluginDefinition } from "./types";

export interface PluginRuntime {
  plugins: PluginDefinition[];
  contributions: Contribution[];
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
    const contributions = plugins.flatMap((p) => p.contributions ?? []);
    return { plugins, contributions };
  }, [plugins]);

  return (
    <PluginRuntimeContext.Provider value={runtime}>
      {children}
    </PluginRuntimeContext.Provider>
  );
}
