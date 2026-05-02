import { useEffect, useMemo, useState } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import type { PluginNode, PublishTreePayload } from "../../shared/types";
import { PluginDetail } from "./plugin-detail";
import { PluginTree } from "./plugin-tree";

type LoadState =
  | { kind: "loading" }
  | { kind: "ok"; data: PublishTreePayload }
  | { kind: "error"; message: string };

export function PublishView() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/publish/tree")
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
        const data = (await res.json()) as PublishTreePayload;
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

  const selectedNode =
    selectedId && indexed.get(selectedId) ? indexed.get(selectedId)! : null;

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
      <div className="border-b px-6 py-4">
        <div className="flex items-baseline justify-between">
          <h1 className="text-base font-semibold tracking-tight">
            Review your plugin tree
          </h1>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <Stat value={totals.plugins} label="plugins" />
            <Divider />
            <Stat value={totals.loadBearing} label="load-bearing" />
            <Divider />
            <Stat value={totals.umbrellas} label="umbrellas" />
          </div>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Inspect what would be included in a release. Publishing is not yet
          wired up.
        </p>
      </div>
      <div className="flex-1 min-h-0">
        <ResizablePanelGroup orientation="horizontal" className="h-full">
          <ResizablePanel defaultSize="32%" minSize="22%" maxSize="50%">
            <PluginTree
              plugins={plugins}
              selected={selectedId}
              onSelect={setSelectedId}
            />
          </ResizablePanel>
          <ResizableHandle withHandle />
          <ResizablePanel defaultSize="68%" minSize="50%">
            <PluginDetail node={selectedNode} />
          </ResizablePanel>
        </ResizablePanelGroup>
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

function Divider() {
  return <span className="text-muted-foreground/40">·</span>;
}
