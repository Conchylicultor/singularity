import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleChevron,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@plugins/primitives/plugins/collapsible/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Badge } from "@plugins/primitives/plugins/badge/web";
import {
  Section,
  pluginViewPane,
  RUNTIME_COLORS,
  type PluginNode,
  type ExportRuntime,
} from "@plugins/plugin-meta/plugins/plugin-view/web";
import type {
  ExportsData,
  ExportedSymbol,
} from "@plugins/plugin-meta/plugins/facets/plugins/exports/core";

// This sub-plugin renders the exports facet's own data. Read `node.facets[id]`
// directly (as every render host does) rather than importing the build-time
// `facets/core` barrel, which would drag `loadFacets` + `fs`/`path` into the
// browser bundle. Type-only imports from the facet core are erased and safe.
const EXPORTS_FACET_ID = "exports";

const RUNTIMES: ExportRuntime[] = ["web", "server", "central", "core", "shared"];

type SymbolCategory = "type" | "hook" | "component" | "value";

// Derives the presentation category from a symbol's name + kind.
// Ported from plugin-view's tree-handler.ts — the facet stores only
// { name, kind, consumers } and leaves presentation to the renderer.
function categorize(name: string, kind: "type" | "value"): SymbolCategory {
  if (kind === "type") return "type";
  if (/^use[A-Z]/.test(name)) return "hook";
  if (/^[A-Z]/.test(name)) return "component";
  return "value";
}

interface SymbolRow {
  name: string;
  category: SymbolCategory;
  consumers: string[];
}

export function ExportsDetailSection({ node }: { node: PluginNode }) {
  const data = node.facets?.[EXPORTS_FACET_ID] as ExportsData | undefined;
  if (!data) return null;

  const total = RUNTIMES.reduce((sum, rt) => sum + data[rt].length, 0);
  if (total === 0) return null;

  const largestRuntime = RUNTIMES.reduce((best, rt) =>
    data[rt].length > data[best].length ? rt : best,
  );

  return (
    <Section title="Exports" count={`${total} export${total !== 1 ? "s" : ""}`}>
      <div className="flex flex-col gap-3">
        {RUNTIMES.map((rt) =>
          data[rt].length > 0 ? (
            <RuntimeGroup
              key={rt}
              runtime={rt}
              symbols={data[rt]}
              defaultOpen={rt === largestRuntime}
            />
          ) : null,
        )}
      </div>
    </Section>
  );
}

// ── Runtime group ───────────────────────────────────────────────────

function RuntimeGroup({
  runtime,
  symbols,
  defaultOpen,
}: {
  runtime: ExportRuntime;
  symbols: ExportedSymbol[];
  defaultOpen: boolean;
}) {
  const sorted = useMemo<SymbolRow[]>(
    () =>
      symbols
        .map((s) => ({
          name: s.name,
          category: categorize(s.name, s.kind),
          consumers: s.consumers,
        }))
        .sort((a, b) => {
          const order = { hook: 0, component: 1, value: 2, type: 3 };
          const d = order[a.category] - order[b.category];
          return d !== 0 ? d : a.name.localeCompare(b.name);
        }),
    [symbols],
  );

  return (
    <Collapsible defaultOpen={defaultOpen}>
      <CollapsibleTrigger className="gap-1 py-0.5 text-xs">
        <CollapsibleChevron className="size-3.5 text-muted-foreground" />
        <span className={cn("font-mono font-medium", RUNTIME_COLORS[runtime])}>
          {runtime}
        </span>
        <span className="text-muted-foreground/50">({symbols.length})</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="ml-1 flex flex-col gap-px border-l border-border/50 pl-3 pt-0.5">
        {sorted.map((row) => (
          <SymbolRow key={row.name} row={row} />
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

// ── Symbol row ──────────────────────────────────────────────────────

const CATEGORY_STYLES: Record<
  SymbolCategory,
  { label: string; className: string }
> = {
  hook: {
    label: "hook",
    className: "bg-categorical-6/10 text-categorical-6",
  },
  component: {
    label: "comp",
    className: "bg-categorical-1/10 text-categorical-1",
  },
  type: {
    label: "type",
    className: "bg-categorical-10/10 text-categorical-10",
  },
  value: {
    label: "val",
    className: "bg-categorical-9/10 text-categorical-9",
  },
};

function SymbolRow({ row }: { row: SymbolRow }) {
  const style = CATEGORY_STYLES[row.category];
  const consumers = row.consumers;

  return (
    <div className="group flex items-center gap-2 rounded-sm px-1.5 py-px text-xs hover:bg-accent/50">
      <Badge
        size="sm"
        colorClass={style.className}
        className="w-10 shrink-0 justify-center font-mono"
      >
        {style.label}
      </Badge>
      <code className="min-w-0 truncate font-mono text-foreground">
        {row.name}
      </code>
      {consumers.length > 0 && <ConsumerList names={consumers} />}
    </div>
  );
}

function ConsumerList({ names }: { names: string[] }) {
  const [expanded, setExpanded] = useState(false);
  const threshold = 2;
  const visible = expanded ? names : names.slice(0, threshold);
  const remaining = names.length - threshold;

  return (
    <span className="ml-auto inline-flex shrink-0 items-center gap-1 text-3xs text-muted-foreground/60">
      <span>←</span>
      {visible.map((name, i) => (
        <span key={name}>
          <PluginLink name={name} />
          {i < visible.length - 1 && ","}
        </span>
      ))}
      {!expanded && remaining > 0 && (
        <button
          className="hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(true);
          }}
        >
          +{remaining}
        </button>
      )}
    </span>
  );
}

// ── Shared primitives ───────────────────────────────────────────────

function PluginLink({ name }: { name: string }) {
  const openPane = useOpenPane();
  return (
    <button
      className="font-medium text-muted-foreground hover:text-foreground hover:underline"
      onClick={(e) => {
        e.stopPropagation();
        openPane(pluginViewPane, { pluginId: name }, { mode: "swap" });
      }}
    >
      {name}
    </button>
  );
}
