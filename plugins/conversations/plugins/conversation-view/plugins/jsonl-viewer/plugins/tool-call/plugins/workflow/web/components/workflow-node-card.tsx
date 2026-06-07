import { MdAccountTree } from "react-icons/md";
import { cn } from "@/lib/utils";
import { familyClass } from "@plugins/conversations/plugins/model-provider/web";
import { MODEL_TIERS, modelDisplayLabel } from "@plugins/conversations/plugins/model-provider/core";
import type { TracedNode } from "../internal/trace-types";
import { Badge, formatStatusLabel } from "@plugins/primitives/plugins/badge/web";

export type NodeEmphasis = "normal" | "dim" | "dep" | "dependent" | "active";

function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <Badge variant="muted" size="sm" className="shrink-0 tracking-wider">
      {children}
    </Badge>
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
  const modelTier = node.model ? MODEL_TIERS.find((t) => node.model!.includes(t)) : undefined;
  const modelColor = node.model
    ? (modelTier ? familyClass(modelTier) : "bg-muted text-muted-foreground")
    : null;

  return (
    <button
      type="button"
      onClick={() => onOpen(node.id)}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      // eslint-disable-next-line row/no-adhoc-row -- DAG node card: flex-col layout with border-color hover and bg-card; Row is flex-row only
      className={cn(
        "flex w-full min-w-0 flex-col gap-1 rounded-md border border-border bg-card px-2.5 py-2 text-left transition-all",
        "hover:border-foreground/40",
        emphasis === "dim" && "opacity-40",
        emphasis === "active" && "border-primary ring-2 ring-primary/30",
        emphasis === "dep" && "border-categorical-3/60",
        emphasis === "dependent" && "border-categorical-1/60",
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
          <Badge size="sm" colorClass={modelColor} className="shrink-0 font-mono">
            {modelDisplayLabel(node.model!)}
          </Badge>
        )}
      </span>
      {(node.agentType || node.isolation || node.hasSchema) && (
        <span className="flex flex-wrap gap-1">
          {node.agentType && <MetaChip>{formatStatusLabel(node.agentType)}</MetaChip>}
          {node.isolation && <MetaChip>{formatStatusLabel(node.isolation)}</MetaChip>}
          {node.hasSchema && <MetaChip>Schema</MetaChip>}
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
