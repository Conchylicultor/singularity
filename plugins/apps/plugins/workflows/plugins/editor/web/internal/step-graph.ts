import { createElement } from "react";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type {
  GraphCanvasNode,
  GraphCanvasEdge,
} from "@plugins/primitives/plugins/graph-canvas/web";
import type { WorkflowDefinition } from "@plugins/apps/plugins/workflows/plugins/engine/core";
import { NodeActions, DefaultEdgeActions, RouteEdgeActions } from "../components/graph-actions";
import type { useStepTypeIndex } from "./use-step-type-index";

type StepTypeIndex = ReturnType<typeof useStepTypeIndex>;

export interface BuildStepGraphArgs {
  selectedId: string | null;
  stepTypes: StepTypeIndex;
  onSetEntry: (stepId: string) => void;
  onDeleteStep: (stepId: string) => void;
  onRemoveNext: (stepId: string) => void;
  onRemoveRoute: (stepId: string, key: string) => void;
}

const ENTRY_RING = "border-info ring-info/30 ring-2";
const SELECTED_RING = "border-primary ring-primary/40 ring-2";

/**
 * Project a `WorkflowDefinition` onto the generic graph-canvas node/edge model.
 * Purely structural — it never names a concrete step type, only reading icon /
 * label off the `Workflows.StepType` index. The default `next` edge renders
 * solid; each conditional `nextStepMapping` entry renders dashed + muted with
 * its key shown in the hover chip.
 */
export function buildStepGraph(
  def: WorkflowDefinition,
  args: BuildStepGraphArgs,
): { nodes: GraphCanvasNode[]; edges: GraphCanvasEdge[] } {
  const { selectedId, stepTypes, onSetEntry, onDeleteStep, onRemoveNext, onRemoveRoute } = args;
  const steps = Object.values(def.steps);

  const nodes: GraphCanvasNode[] = steps.map((step) => {
    const stepType = stepTypes.get(step.pluginId);
    const Icon = stepType?.icon;
    const isEntry = step.id === def.entryStepId;
    const isSelected = step.id === selectedId;
    // Selected ring wins over entry ring.
    const ringClass = isSelected ? SELECTED_RING : isEntry ? ENTRY_RING : null;
    return {
      id: step.id,
      label: step.label || stepType?.label || step.pluginId,
      title: step.id,
      ringClass,
      leading: Icon
        ? createElement(Icon, { className: "size-4 text-muted-foreground" })
        : undefined,
      badge: isEntry
        ? createElement(Text, { variant: "caption", className: "text-info" }, "Entry")
        : undefined,
      actions: createElement(NodeActions, {
        stepId: step.id,
        isEntry,
        onSetEntry,
        onDeleteStep,
      }),
      connectable: true,
    };
  });

  const edges: GraphCanvasEdge[] = [];
  for (const step of steps) {
    if (step.next && def.steps[step.next]) {
      edges.push({
        from: step.id,
        to: step.next,
        tone: "default",
        actions: createElement(DefaultEdgeActions, { stepId: step.id, onRemove: onRemoveNext }),
      });
    }
    if (step.nextStepMapping) {
      for (const [key, target] of Object.entries(step.nextStepMapping)) {
        if (!def.steps[target]) continue;
        edges.push({
          from: step.id,
          to: target,
          tone: "muted",
          variant: "dashed",
          actions: createElement(RouteEdgeActions, {
            stepId: step.id,
            routeKey: key,
            onRemove: onRemoveRoute,
          }),
        });
      }
    }
  }

  return { nodes, edges };
}
