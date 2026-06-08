import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { pluginViewPane } from "@plugins/plugin-meta/plugins/plugin-view/web";
import { LinkChip } from "@plugins/primitives/plugins/link-chip/web";

export function PluginChip({ pluginId }: { pluginId: string }) {
  const openPane = useOpenPane();
  return (
    <LinkChip
      mono
      title={pluginId}
      className="shrink-0"
      onClick={(e) => {
        e.stopPropagation();
        openPane(pluginViewPane, { pluginId }, { mode: "push" });
      }}
    >
      {pluginId}
    </LinkChip>
  );
}
