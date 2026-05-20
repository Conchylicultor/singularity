import { createContext, useContext } from "react";
import type { PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/core";

interface PluginTreeContextValue {
  expanded: Set<string>;
  toggle: (id: string) => void;
  expandDescendants: (node: PluginNode) => void;
  collapseDescendants: (node: PluginNode) => void;
}

const PluginTreeContext = createContext<PluginTreeContextValue | null>(null);

export const PluginTreeProvider = PluginTreeContext.Provider;

export function usePluginTree(): PluginTreeContextValue {
  const ctx = useContext(PluginTreeContext);
  if (!ctx) throw new Error("usePluginTree must be used inside PluginTreeProvider");
  return ctx;
}
