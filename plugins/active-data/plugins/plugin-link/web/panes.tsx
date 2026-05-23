import { useEffect, useMemo, useState } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import {
  PluginDetail,
  type PluginNode,
  type PluginTreePayload,
} from "@plugins/plugin-meta/plugins/plugin-view/web";

export const pluginConvSidePane = Pane.define({
  id: "plugin-conv-side",
  segment: "plugin/:pluginId",
  component: PluginConvSideBody,
  width: 600,
  chrome: { history: false },
  resolve: false,
});

type TreeState =
  | { kind: "loading" }
  | { kind: "ok"; data: PluginTreePayload }
  | { kind: "error"; message: string };

function indexNodes(nodes: PluginNode[], map = new Map<string, PluginNode>()) {
  for (const node of nodes) {
    map.set(node.hierarchyId, node);
    indexNodes(node.children, map);
  }
  return map;
}

function PluginConvSideBody() {
  const { pluginId } = pluginConvSidePane.useParams();
  const [state, setState] = useState<TreeState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/plugin-view/tree")
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          setState({ kind: "error", message: `Failed to load (${res.status})` });
          return;
        }
        setState({ kind: "ok", data: (await res.json()) as PluginTreePayload });
      })
      .catch((err) => {
        if (!cancelled) setState({ kind: "error", message: String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const node = useMemo(
    () => (state.kind === "ok" ? (indexNodes(state.data.plugins).get(pluginId) ?? null) : null),
    [state, pluginId],
  );

  return (
    <PaneChrome pane={pluginConvSidePane} title={node?.name ?? pluginId}>
      {state.kind === "loading" ? (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Loading…
        </div>
      ) : state.kind === "error" ? (
        <div className="flex h-full items-center justify-center p-8 text-sm text-muted-foreground">
          {state.message}
        </div>
      ) : (
        <PluginDetail node={node} />
      )}
    </PaneChrome>
  );
}
