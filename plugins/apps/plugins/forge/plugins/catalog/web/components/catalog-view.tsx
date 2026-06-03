import { useEffect, useState } from "react";
import { FilterChip } from "@plugins/primitives/plugins/filter-chips/web";
import { Badge } from "@plugins/primitives/plugins/badge/web";
import { SearchInput } from "@plugins/primitives/plugins/search/web";
import type {
  PluginNode,
  PluginTreePayload,
} from "@plugins/plugin-meta/plugins/plugin-view/core";
import { Catalog } from "../slots";

type LoadState =
  | { kind: "loading" }
  | { kind: "ok"; data: PluginTreePayload }
  | { kind: "error"; message: string };

export function CatalogView() {
  const [state, setState] = useState<LoadState>({ kind: "loading" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  // Display metadata (id, label, icon, getCount) is readable directly; only the
  // `component` field is sealed (rendered via the slot's .Dispatch below).
  const categories = Catalog.Category.useContributions();

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
        Loading…
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-sm">
        <span className="font-medium text-foreground">Failed to load</span>
        <span className="text-muted-foreground">{state.message}</span>
      </div>
    );
  }

  const { plugins } = state.data;
  const activeId = selectedId ?? categories[0]?.id ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex gap-1 overflow-x-auto border-b px-3 py-2">
        {categories.map((cat) => {
          const count = cat.getCount(plugins);
          const active = cat.id === activeId;
          return (
            <FilterChip
              key={cat.id}
              active={active}
              onClick={() => {
                setSelectedId(cat.id);
                setFilter("");
              }}
            >
              <cat.icon size={14} />
              <span className="font-medium">{cat.label}</span>
              <Badge
                size="sm"
                colorClass={active ? "bg-foreground/10 text-foreground" : undefined}
              >
                {count}
              </Badge>
            </FilterChip>
          );
        })}
      </div>

      <div className="border-b px-3 py-2">
        <SearchInput
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter…"
        />
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {activeId != null ? (
          <Catalog.Category.Dispatch
            plugins={plugins}
            filter={filter}
            activeId={activeId}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No categories registered
          </div>
        )}
      </div>
    </div>
  );
}

export function flattenTree<T>(
  plugins: PluginNode[],
  extract: (p: PluginNode) => T[],
): { item: T; plugin: PluginNode }[] {
  const out: { item: T; plugin: PluginNode }[] = [];
  function visit(node: PluginNode) {
    for (const item of extract(node)) {
      out.push({ item, plugin: node });
    }
    for (const child of node.children) visit(child);
  }
  for (const p of plugins) visit(p);
  return out;
}
