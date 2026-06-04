import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { pluginViewPane } from "../panes";

/**
 * Inline button linking to another plugin's detail pane. Shared across the
 * per-facet render-detail sections (exports, cross-refs, …) that surface
 * consumer/importer relationships.
 */
export function PluginLink({ name }: { name: string }) {
  const openPane = useOpenPane();
  return (
    <button
      className="font-medium text-muted-foreground hover:text-foreground hover:underline"
      onClick={(e) => {
        e.stopPropagation();
        openPane(pluginViewPane, { pluginId: name }, { mode: "swap" });
      }}
    >
      {name}
    </button>
  );
}
