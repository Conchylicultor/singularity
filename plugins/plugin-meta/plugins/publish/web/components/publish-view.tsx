import { useEffect, useState } from "react";
import {
  usePaneMatch,
} from "@plugins/primitives/plugins/pane/web";
import { pluginViewPane } from "@plugins/plugin-meta/plugins/plugin-view/web";
import type { PluginTreePayload } from "@plugins/plugin-meta/plugins/plugin-view/shared";
import { PluginTree } from "./plugin-tree";

type LoadState =
  | { kind: "loading" }
  | { kind: "ok"; data: PluginTreePayload }
  | { kind: "error"; message: string };

export function PublishView() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  const match = usePaneMatch();
  const selectedId =
    match?.chain.find((e) => e.pane === pluginViewPane._internal)?.params
      .pluginId ?? null;

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

  if (state.kind === "loading") {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading plugin tree…
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-sm">
        <span className="font-medium text-foreground">
          Failed to load plugin tree
        </span>
        <span className="text-muted-foreground">{state.message}</span>
      </div>
    );
  }

  const { plugins, totals } = state.data;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b px-4 py-3">
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          <Stat value={totals.plugins} label="plugins" />
          <Stat value={totals.loadBearing} label="load-bearing" />
          <Stat value={totals.umbrellas} label="umbrellas" />
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <PluginTree
          plugins={plugins}
          selected={selectedId}
          onSelect={(id) => pluginViewPane.open({ pluginId: id })}
        />
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <span>
      <span className="font-medium text-foreground">{value}</span>{" "}
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}
