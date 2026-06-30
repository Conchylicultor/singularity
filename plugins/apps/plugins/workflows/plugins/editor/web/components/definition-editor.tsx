import { useMemo, useState } from "react";
import { GraphCanvas } from "@plugins/primitives/plugins/graph-canvas/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Surface } from "@plugins/primitives/plugins/css/plugins/surface/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { useEventCallback } from "@plugins/primitives/plugins/latest-ref/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  updateDefinition,
  type WorkflowDefinition,
} from "@plugins/apps/plugins/workflows/plugins/engine/core";
import {
  addStep,
  connect,
  setEntry,
  setNext,
  deleteStep,
  removeRoute,
  type StepPatch,
} from "../../shared/step-ops";
import { useStepTypeIndex } from "@plugins/apps/plugins/workflows/plugins/engine/web";
import { buildStepGraph } from "../internal/step-graph";
import { AddStepMenu } from "./add-step-menu";
import { StepInspector } from "./step-inspector";

/**
 * Visual step-graph editor for one workflow definition. Generic over the
 * `Workflows.StepType` slot — it never names a concrete step type. Structural
 * edits (add / delete / connect / set-entry / routing) PATCH immediately; the
 * `workflowDefinitionsDescriptor` live resource pushes the result back, so the
 * canvas re-renders from server truth.
 */
export function DefinitionEditor({
  definitionId,
  def,
}: {
  definitionId: string;
  def: WorkflowDefinition;
}) {
  const stepTypes = useStepTypeIndex();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const persist = useEventCallback((patch: StepPatch) =>
    fetchEndpoint(updateDefinition, { id: definitionId }, { body: patch }),
  );

  const handleSetEntry = useEventCallback((stepId: string) => {
    void persist(setEntry(def, stepId));
  });
  const handleDeleteStep = useEventCallback((stepId: string) => {
    void persist(deleteStep(def, stepId));
    if (selectedId === stepId) setSelectedId(null);
  });
  const handleRemoveNext = useEventCallback((stepId: string) => {
    void persist(setNext(def, stepId, null));
  });
  const handleRemoveRoute = useEventCallback((stepId: string, key: string) => {
    void persist(removeRoute(def, stepId, key));
  });

  const { nodes, edges } = useMemo(
    () =>
      buildStepGraph(def, {
        selectedId,
        stepTypes,
        onSetEntry: handleSetEntry,
        onDeleteStep: handleDeleteStep,
        onRemoveNext: handleRemoveNext,
        onRemoveRoute: handleRemoveRoute,
      }),
    [
      def,
      selectedId,
      stepTypes,
      handleSetEntry,
      handleDeleteStep,
      handleRemoveNext,
      handleRemoveRoute,
    ],
  );

  const selectedStep = selectedId ? (def.steps[selectedId] ?? null) : null;
  const isEmpty = Object.keys(def.steps).length === 0;

  return (
    <Stack gap="md">
      <Stack direction="row" align="center" gap="md" wrap>
        <AddStepMenu
          onAdd={(pluginId, label) => {
            const r = addStep(def, pluginId, label);
            void persist(r);
            setSelectedId(r.newStepId);
          }}
        />
        <Text variant="caption" className="text-muted-foreground">
          Drag between steps to connect them.
        </Text>
      </Stack>

      <Stack direction="row" gap="md" wrap align="start">
        <Fill className="h-[440px] min-w-[320px]">
          <Surface level="sunken" className="size-full">
            {isEmpty ? (
              <Center className="size-full">
                <Text variant="body" className="text-muted-foreground">
                  No steps yet — add one to start.
                </Text>
              </Center>
            ) : (
              <GraphCanvas
                nodes={nodes}
                edges={edges}
                connectable
                edgePath="smoothstep"
                direction="LR"
                onNodeClick={(id) => setSelectedId(id)}
                onConnect={(s, t) => void persist(connect(def, s, t))}
              />
            )}
          </Surface>
        </Fill>

        {selectedStep ? (
          <div className="w-[300px] min-w-[300px]">
            <StepInspector
              key={selectedStep.id}
              definitionId={definitionId}
              def={def}
              step={selectedStep}
              stepTypes={stepTypes}
              onClose={() => setSelectedId(null)}
            />
          </div>
        ) : null}
      </Stack>
    </Stack>
  );
}
