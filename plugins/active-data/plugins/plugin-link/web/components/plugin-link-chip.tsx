import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Blocks } from "lucide-react";
import type { PluginNode, PluginTreePayload } from "@plugins/plugin-meta/plugins/plugin-view/web";
import { pluginViewPane } from "@plugins/plugin-meta/plugins/plugin-view/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { pluginConvSidePane } from "../panes";

function indexNodes(nodes: PluginNode[], map = new Map<string, PluginNode>()) {
  for (const node of nodes) {
    map.set(node.hierarchyId, node);
    indexNodes(node.children, map);
  }
  return map;
}

export function PluginLinkChip({
  content,
}: {
  content: string;
  attrs: Record<string, string>;
}) {
  const id = content.trim();
  const { conversation } = conversationPane.useData() ?? {};

  const { data } = useQuery<PluginTreePayload>({
    queryKey: ["plugin-view-tree"],
    queryFn: () => fetch("/api/plugin-view/tree").then((r) => r.json()),
    staleTime: 60_000,
  });

  const node = useMemo(
    () => (data ? indexNodes(data.plugins).get(id) : undefined),
    [data, id],
  );

  // Not a known plugin (or still loading) — preserve the original code appearance.
  if (!node) {
    return (
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
        {id}
      </code>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (conversation) {
          pluginConvSidePane.open({ convId: conversation.id, pluginId: id });
        } else {
          pluginViewPane.open({ pluginId: id });
        }
      }}
      className="inline-flex max-w-full items-center gap-1 rounded bg-muted px-1.5 py-0.5 align-baseline text-xs text-primary hover:bg-muted/80 hover:underline"
      title={node.description ?? id}
    >
      <Blocks className="size-3 shrink-0 text-muted-foreground" />
      <span className="truncate font-mono">{id}</span>
    </button>
  );
}
