import { MdWidgets } from "react-icons/md";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { LinkChip } from "@plugins/primitives/plugins/css/plugins/link-chip/web";
import type { PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/web";
import { pluginViewPane } from "@plugins/plugin-meta/plugins/plugin-view/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { pluginConvSidePane } from "../panes";

/**
 * Pure renderer, reachable ONLY on a claim — `value` is a resolved plugin, so
 * there is no "unknown plugin" branch here and no hand-rolled `<code>` fallback.
 * When the token does not resolve, `usePluginClaim` declines and the host's
 * arbitration chain owns what renders instead.
 */
export function PluginLinkChip({
  content,
  value,
}: {
  content: string;
  value: PluginNode;
}) {
  const convId = conversationPane.useRouteEntry()?.params.convId ?? null;
  const openPane = useOpenPane();
  const resolvedId = value.id;

  return (
    <LinkChip
      onClick={(e) => {
        e.stopPropagation();
        if (convId) {
          openPane(pluginConvSidePane, { pluginId: resolvedId }, { mode: "push" });
        } else {
          openPane(pluginViewPane, { pluginId: resolvedId }, { mode: "push" });
        }
      }}
      title={value.description ?? resolvedId}
      leading={<MdWidgets className="text-muted-foreground" />}
      mono
    >
      {content}
    </LinkChip>
  );
}
