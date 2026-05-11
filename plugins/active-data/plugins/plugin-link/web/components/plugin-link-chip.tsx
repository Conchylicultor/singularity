import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Blocks } from "lucide-react";
import type { PluginNode, PluginTreePayload } from "@plugins/plugin-meta/plugins/plugin-view/web";
import { pluginViewPane } from "@plugins/plugin-meta/plugins/plugin-view/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { pluginConvSidePane } from "../panes";

interface PluginIndex {
  byId: Map<string, PluginNode>;
  bySegment: Map<string, PluginNode[]>;
}

function indexNodes(
  nodes: PluginNode[],
  index: PluginIndex = { byId: new Map(), bySegment: new Map() },
): PluginIndex {
  for (const node of nodes) {
    index.byId.set(node.hierarchyId, node);
    const seg = node.hierarchyId.split(".").pop()!;
    const arr = index.bySegment.get(seg);
    if (arr) arr.push(node);
    else index.bySegment.set(seg, [node]);
    indexNodes(node.children, index);
  }
  return index;
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

  const index = useMemo(
    () => (data ? indexNodes(data.plugins) : undefined),
    [data],
  );

  const node = useMemo(() => {
    if (!index) return undefined;
    const exact = index.byId.get(id);
    if (exact) return exact;
    // Fuzzy: if the input matches exactly one plugin's last segment, use it.
    const candidates = index.bySegment.get(id);
    return candidates?.length === 1 ? candidates[0] : undefined;
  }, [index, id]);

  // Not a known plugin (or still loading) — preserve the original code appearance.
  if (!node) {
    return (
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">
        {id}
      </code>
    );
  }

  const resolvedId = node.hierarchyId;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (conversation) {
          pluginConvSidePane.open({ convId: conversation.id, pluginId: resolvedId });
        } else {
          pluginViewPane.open({ pluginId: resolvedId });
        }
      }}
      className="inline-flex max-w-full items-center gap-1 rounded bg-muted px-1.5 py-0.5 align-baseline text-xs text-primary hover:bg-muted/80 hover:underline"
      title={node.description ?? resolvedId}
    >
      <Blocks className="size-3 shrink-0 text-muted-foreground" />
      <span className="truncate font-mono">{resolvedId}</span>
    </button>
  );
}
