import { useEffect, useMemo, useState } from "react";
import { Pane, PaneChrome } from "@plugins/primitives/plugins/pane/web";
import type { PluginNode, PluginTreePayload } from "../core/types";
import { PluginDetail } from "./components/plugin-detail";

export const pluginViewPane = Pane.define({
  id: "plugin-view",
  segment: "p/:pluginId",
  component: PluginViewBody,
  width: 600,
});

type LoadState =
  | { kind: "loading" }
  | { kind: "ok"; data: PluginTreePayload }
  | { kind: "error"; message: string };

function PluginViewBody() {
  const { pluginId } = pluginViewPane.useParams();
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/plugin-view/tree")
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          setState({
            kind: "error",
            message: text || `Failed to load (${res.status})`,
          });
          return;
        }
        const data = (await res.json()) as PluginTreePayload;
        setState({ kind: "ok", data });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ kind: "error", message: String(err) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const indexed = useMemo(() => {
    if (state.kind !== "ok") return new Map<string, PluginNode>();
    const map = new Map<string, PluginNode>();
    function visit(n: PluginNode) {
      map.set(n.hierarchyId, n);
      for (const c of n.children) visit(c);
    }
    for (const p of state.data.plugins) visit(p);
    return map;
  }, [state]);

  const node = indexed.get(pluginId) ?? null;

  if (state.kind === "loading") {
    return (
      <PaneChrome pane={pluginViewPane} title="Plugin">
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Loading…
        </div>
      </PaneChrome>
    );
  }
  if (state.kind === "error") {
    return (
      <PaneChrome pane={pluginViewPane} title="Plugin">
        <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-sm">
          <span className="font-medium text-foreground">
            Failed to load plugin tree
          </span>
          <span className="text-muted-foreground">{state.message}</span>
        </div>
      </PaneChrome>
    );
  }

  return (
    <PaneChrome pane={pluginViewPane} title={node?.name ?? pluginId}>
      <PluginDetail node={node} />
    </PaneChrome>
  );
}
