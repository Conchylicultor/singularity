import { useMemo, useState } from "react";
import { MdBolt, MdChevronRight, MdExpandMore } from "react-icons/md";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { PluginNode } from "../../shared/types";

interface PluginTreeProps {
  plugins: PluginNode[];
  selected: string | null;
  onSelect: (hierarchyId: string) => void;
}

export function PluginTree({ plugins, selected, onSelect }: PluginTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const set = new Set<string>();
    for (const p of plugins) if (p.children.length > 0) set.add(p.hierarchyId);
    return set;
  });
  const [filter, setFilter] = useState("");

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const filtered = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return plugins;
    return plugins
      .map((p) => filterNode(p, needle))
      .filter((p): p is PluginNode => p !== null);
  }, [plugins, filter]);

  const effectiveExpanded = filter.trim()
    ? new Set<string>(collectAllIds(filtered))
    : expanded;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-3 py-2.5 border-b">
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter plugins"
          className="h-7 text-xs"
        />
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto py-1">
        {filtered.map((p) => (
          <TreeRow
            key={p.hierarchyId}
            node={p}
            depth={0}
            selected={selected}
            expanded={effectiveExpanded}
            onSelect={onSelect}
            onToggle={toggle}
          />
        ))}
        {filtered.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-muted-foreground">
            No plugins match "{filter}"
          </div>
        )}
      </div>
    </div>
  );
}

interface TreeRowProps {
  node: PluginNode;
  depth: number;
  selected: string | null;
  expanded: Set<string>;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}

function TreeRow({
  node,
  depth,
  selected,
  expanded,
  onSelect,
  onToggle,
}: TreeRowProps) {
  const isOpen = expanded.has(node.hierarchyId);
  const isSelected = node.hierarchyId === selected;
  const hasChildren = node.children.length > 0;

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(node.hierarchyId)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect(node.hierarchyId);
          }
        }}
        className={cn(
          "flex h-7 w-full cursor-pointer select-none items-center gap-1 pr-2 text-left transition-colors",
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
              onToggle(node.hierarchyId);
            }}
            aria-label={isOpen ? "Collapse" : "Expand"}
            className="inline-flex size-4 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted-foreground/10"
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
        <span
          className={cn(
            "flex-1 truncate text-xs",
            isSelected
              ? "font-medium text-foreground"
              : "text-foreground/85",
          )}
        >
          {node.name}
        </span>
        {node.loadBearing && (
          <MdBolt
            className="size-3.5 shrink-0 text-amber-500/90"
            aria-label="Load-bearing"
          />
        )}
      </div>
      {isOpen &&
        hasChildren &&
        node.children.map((c) => (
          <TreeRow
            key={c.hierarchyId}
            node={c}
            depth={depth + 1}
            selected={selected}
            expanded={expanded}
            onSelect={onSelect}
            onToggle={onToggle}
          />
        ))}
    </>
  );
}

function filterNode(node: PluginNode, needle: string): PluginNode | null {
  const matches = node.name.toLowerCase().includes(needle);
  const filteredChildren = node.children
    .map((c) => filterNode(c, needle))
    .filter((c): c is PluginNode => c !== null);
  if (!matches && filteredChildren.length === 0) return null;
  return { ...node, children: filteredChildren };
}

function collectAllIds(nodes: PluginNode[]): string[] {
  const out: string[] = [];
  function visit(n: PluginNode) {
    out.push(n.hierarchyId);
    for (const c of n.children) visit(c);
  }
  for (const n of nodes) visit(n);
  return out;
}
