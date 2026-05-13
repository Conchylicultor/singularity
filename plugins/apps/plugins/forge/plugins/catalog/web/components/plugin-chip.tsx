import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { pluginViewPane } from "@plugins/plugin-meta/plugins/plugin-view/web";

export function PluginChip({ hierarchyId }: { hierarchyId: string }) {
  const openPane = useOpenPane();
  return (
    <button
      className="shrink-0 rounded bg-accent/50 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
      onClick={(e) => {
        e.stopPropagation();
        openPane(pluginViewPane, { pluginId: hierarchyId }, { mode: "push" });
      }}
    >
      {hierarchyId}
    </button>
  );
}
