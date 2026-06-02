import { MdAccountTree } from "react-icons/md";
import { cn } from "@/lib/utils";
import type { TracedNode } from "../internal/trace-types";

// Same categorical palette as the Agent tool renderer's ModelBadge.
const MODEL_COLORS: Record<string, string> = {
  opus: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  sonnet: "bg-sky-500/15 text-sky-700 dark:text-sky-400",
  haiku: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
};

export type NodeEmphasis = "normal" | "dim" | "dep" | "dependent" | "active";

function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
      {children}
    </span>
  );
}

export function WorkflowNodeCard({
  node,
  emphasis,
  onOpen,
  onHover,
}: {
  node: TracedNode;
  emphasis: NodeEmphasis;
  onOpen: (nodeId: string) => void;
  onHover: (nodeId: string | null) => void;
}) {
  const modelColor = node.model
    ? (MODEL_COLORS[node.model] ?? "bg-muted text-muted-foreground")
    : null;

  return (
    <button
      type="button"
      onClick={() => onOpen(node.id)}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      className={cn(
        "flex w-full min-w-0 flex-col gap-1 rounded-md border border-border bg-card px-2.5 py-2 text-left transition-all",
        "hover:border-foreground/40",
        emphasis === "dim" && "opacity-40",
        emphasis === "active" && "border-primary ring-2 ring-primary/30",
        emphasis === "dep" && "border-amber-500/60 dark:border-amber-400/60",
        emphasis === "dependent" && "border-sky-500/60 dark:border-sky-400/60",
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        {node.kind === "workflow" && (
          <MdAccountTree className="size-3 shrink-0 text-muted-foreground" />
        )}
        <span className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">
          {node.label}
        </span>
        {modelColor && (
          <span
            className={cn(
              "shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] capitalize",
              modelColor,
            )}
          >
            {node.model}
          </span>
        )}
      </span>
      {(node.agentType || node.isolation || node.hasSchema) && (
        <span className="flex flex-wrap gap-1">
          {node.agentType && <MetaChip>{node.agentType}</MetaChip>}
          {node.isolation && <MetaChip>{node.isolation}</MetaChip>}
          {node.hasSchema && <MetaChip>schema</MetaChip>}
        </span>
      )}
      {node.promptPreview && (
        <span className="line-clamp-2 text-[11px] leading-snug text-muted-foreground">
          {node.promptPreview}
        </span>
      )}
    </button>
  );
}
