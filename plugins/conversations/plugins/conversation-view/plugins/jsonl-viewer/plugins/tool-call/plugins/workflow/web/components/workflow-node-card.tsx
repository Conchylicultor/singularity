import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { MdAccountTree } from "react-icons/md";
import { familyClass } from "@plugins/conversations/plugins/model-provider/web";
import {
  MODEL_TIERS,
  modelDisplayLabel,
} from "@plugins/conversations/plugins/model-provider/core";
import type { TracedNode } from "../internal/trace-types";
import {
  Badge,
  formatStatusLabel,
} from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";

export type NodeEmphasis = "normal" | "dim" | "dep" | "dependent" | "active";

function MetaChip({ children }: { children: React.ReactNode }) {
  return (
    <Badge variant="muted" className="tracking-wider">
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
  const modelTier = node.model
    ? MODEL_TIERS.find((t) => node.model!.includes(t))
    : undefined;
  const modelColor = node.model
    ? modelTier
      ? familyClass(modelTier)
      : "bg-muted text-muted-foreground"
    : null;

  return (
    <Card
      as="button"
      type="button"
      onClick={() => onOpen(node.id)}
      onMouseEnter={() => onHover(node.id)}
      onMouseLeave={() => onHover(null)}
      className={cn(
        "w-full px-sm py-sm text-left transition-all",
        "hover:border-foreground/40",
        emphasis === "dim" && "opacity-40",
        emphasis === "active" && "border-primary ring-2 ring-primary/30",
        emphasis === "dep" && "border-categorical-3/60",
        emphasis === "dependent" && "border-categorical-1/60",
      )}
    >
      <Stack gap="xs">
        <Line as="span" className="gap-xs">
          {node.kind === "workflow" && (
            <MdAccountTree
              className={cn("size-3 text-muted-foreground", rigidClass())}
            />
          )}
          <Fill as="span">
            <Text as="span" variant="label" className="text-foreground">
              {node.label}
            </Text>
          </Fill>
          {modelColor && (
            <Badge
              colorClass={modelColor}
              className={cn(rigidClass(), "font-mono")}
            >
              {modelDisplayLabel(node.model!)}
            </Badge>
          )}
        </Line>
        {(node.agentType || node.isolation || node.hasSchema) && (
          <Cluster gap="xs">
            {node.agentType && (
              <MetaChip>{formatStatusLabel(node.agentType)}</MetaChip>
            )}
            {node.isolation && (
              <MetaChip>{formatStatusLabel(node.isolation)}</MetaChip>
            )}
            {node.hasSchema && <MetaChip>Schema</MetaChip>}
          </Cluster>
        )}
        {node.promptPreview && (
          <span className="line-clamp-2 text-2xs text-muted-foreground">
            {node.promptPreview}
          </span>
        )}
      </Stack>
    </Card>
  );
}
