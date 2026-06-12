import { cn } from "@plugins/primitives/plugins/ui-kit/web";
import { useCallback, useMemo, useState } from "react";
import { MdChevronRight, MdExpandMore } from "react-icons/md";
import { SearchInput, filterTree, collectAllIds } from "@plugins/primitives/plugins/search/web";
import { ExpandAllButton } from "@plugins/primitives/plugins/collapsible/web";
import type { PluginNode } from "@plugins/plugin-meta/plugins/plugin-view/core";
import { Text } from "@plugins/primitives/plugins/text/web";
import { Explorer } from "../slots";
import { PluginTreeProvider, usePluginTree } from "../context";

function collectAllExpandableIds(nodes: PluginNode[]): Set<string> {
  const set = new Set<string>();
  function walk(ns: PluginNode[]) {
    for (const n of ns) {
      if (n.children.length > 0) {
        set.add(n.id);
        walk(n.children);
      }
    }
  }
  walk(nodes);
  return set;
}

function collectSubtreeIds(node: PluginNode): string[] {
  const ids: string[] = [];
  if (node.children.length > 0) {
    ids.push(node.id);
    for (const child of node.children) {
      ids.push(...collectSubtreeIds(child));
    }
  }
  return ids;
}

interface PluginTreeProps {
  plugins: PluginNode[];
  selected: string | null;
  onSelect: (pluginId: string) => void;
}

export function PluginTree({ plugins, selected, onSelect }: PluginTreeProps) {
  const allExpandable = useMemo(() => collectAllExpandableIds(plugins), [plugins]);
  const [expanded, setExpanded] = useState<Set<string>>(() => collectAllExpandableIds(plugins));
  const [filter, setFilter] = useState("");

  const toggle = useCallback(
    (id: string) =>
      setExpanded((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      }),
    [],
  );

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return plugins;
    return filterTree(
      plugins,
      (n) => n.name.toLowerCase().includes(needle),
      (n) => n.children,
      (n, children) => ({ ...n, children }),
    );
  }, [plugins, filter]);

  const effectiveExpanded = useMemo(
    () =>
      filter.trim()
        ? new Set<string>(
            collectAllIds(
              filtered,
              (n) => n.id,
              (n) => n.children,
            ),
          )
        : expanded,
    [filter, filtered, expanded],
  );

  const isAllExpanded = allExpandable.size > 0 && [...allExpandable].every((id) => expanded.has(id));

  const toggleAll = () => {
    setExpanded(isAllExpanded ? new Set() : new Set(allExpandable));
  };

  const expandDescendants = useCallback(
    (node: PluginNode) =>
      setExpanded((prev) => {
        const next = new Set(prev);
        for (const id of collectSubtreeIds(node)) next.add(id);
        return next;
      }),
    [],
  );

  const collapseDescendants = useCallback(
    (node: PluginNode) =>
      setExpanded((prev) => {
        const next = new Set(prev);
        for (const id of collectSubtreeIds(node)) next.delete(id);
        return next;
      }),
    [],
  );

  const ctxValue = useMemo(
    () => ({ expanded: effectiveExpanded, toggle, expandDescendants, collapseDescendants }),
    [effectiveExpanded, toggle, expandDescendants, collapseDescendants],
  );

  return (
    <PluginTreeProvider value={ctxValue}>
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center gap-sm px-md py-sm border-b">
          <div className="flex-1">
            <SearchInput
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter plugins"
            />
          </div>
          <ExpandAllButton allExpanded={isAllExpanded} onToggle={toggleAll} />
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto py-xs">
          {filtered.map((p) => (
            <TreeRow
              key={p.id}
              node={p}
              depth={0}
              selected={selected}
              onSelect={onSelect}
            />
          ))}
          {filtered.length === 0 && (
            <Text as="div" variant="caption" className="px-md py-xl text-center text-muted-foreground">
              No plugins match &quot;{filter}&quot;
            </Text>
          )}
        </div>
      </div>
    </PluginTreeProvider>
  );
}

interface TreeRowProps {
  node: PluginNode;
  depth: number;
  selected: string | null;
  onSelect: (id: string) => void;
}

function TreeRow({ node, depth, selected, onSelect }: TreeRowProps) {
  const { expanded, toggle } = usePluginTree();
  const isOpen = expanded.has(node.id);
  const isSelected = node.id === selected;
  const hasChildren = node.children.length > 0;

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(node.id)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(node.id);
          }
        }}
        className={cn(
          "group/row flex h-7 w-full cursor-pointer select-none items-center gap-xs pr-sm text-left transition-colors",
          isSelected
            ? "bg-accent"
            : "hover:bg-accent/40 focus-visible:bg-accent/40",
        )}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
      >
        {hasChildren ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggle(node.id);
            }}
            aria-label={isOpen ? "Collapse" : "Expand"}
            className="inline-flex size-4 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted-foreground/10"
          >
            {isOpen ? (
              <MdExpandMore className="size-3.5" />
            ) : (
              <MdChevronRight className="size-3.5" />
            )}
          </button>
        ) : (
          <span className="size-4 shrink-0" />
        )}
        <Text
          as="span"
          variant="caption"
          className={cn(
            "flex-1 truncate",
            isSelected
              ? "font-medium text-foreground"
              : "text-foreground/85",
          )}
        >
          {node.name}
        </Text>
        <Explorer.TreeRowBadge.Render>
          {(item) => <item.component node={node} />}
        </Explorer.TreeRowBadge.Render>
      </div>
      {isOpen &&
        hasChildren &&
        node.children.map((c) => (
          <TreeRow
            key={c.id}
            node={c}
            depth={depth + 1}
            selected={selected}
            onSelect={onSelect}
          />
        ))}
    </>
  );
}
