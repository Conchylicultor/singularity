import { MdRadioButtonChecked } from "react-icons/md";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useEditableField } from "@plugins/primitives/plugins/editable-field/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Surface } from "@plugins/primitives/plugins/css/plugins/surface/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import {
  deleteDefinition,
  updateDefinition,
  type DefinitionStep,
  type WorkflowDefinition,
} from "@plugins/apps/plugins/workflows/plugins/engine/core";
import { definitionsRootPane } from "../panes";
import { useStepTypeIndex } from "../internal/use-step-type-index";
import { WorkflowsDetail } from "../slots";

export function DefinitionDetail({
  definitionId,
  def,
}: {
  definitionId: string;
  def: WorkflowDefinition;
}) {
  const openPane = useOpenPane();

  const titleField = useEditableField({
    value: def.name,
    onSave: async (v) => {
      await fetchEndpoint(
        updateDefinition,
        { id: definitionId },
        { body: { name: v.trim() || "Untitled" } },
      );
    },
    label: "Workflow name",
  });

  const descriptionField = useEditableField({
    value: def.description ?? "",
    onSave: async (v) => {
      await fetchEndpoint(
        updateDefinition,
        { id: definitionId },
        { body: { description: v.trim() || null } },
      );
    },
    label: "Workflow description",
  });

  async function handleDelete() {
    if (!confirm(`Delete workflow "${def.name}"?`)) return;
    await fetchEndpoint(deleteDefinition, { id: definitionId });
    openPane(definitionsRootPane, {}, { mode: "root" });
  }

  const steps = Object.values(def.steps);

  return (
    <Stack gap="lg" className="p-lg">
      <Stack direction="row" align="start" justify="between" gap="md">
        <input
          value={titleField.value}
          onChange={(e) => titleField.onChange(e.target.value)}
          onFocus={titleField.onFocus}
          onBlur={titleField.onBlur}
          placeholder="Untitled workflow"
          className="text-title w-full bg-transparent outline-none placeholder:text-muted-foreground focus:ring-0"
        />
        <Button
          variant="link"
          onClick={handleDelete}
          className="text-destructive hover:text-destructive"
        >
          Delete
        </Button>
      </Stack>

      <textarea
        value={descriptionField.value}
        onChange={(e) => descriptionField.onChange(e.target.value)}
        onFocus={descriptionField.onFocus}
        onBlur={descriptionField.onBlur}
        placeholder="Add a description…"
        rows={2}
        className="text-body w-full resize-none bg-transparent outline-none placeholder:text-muted-foreground focus:ring-0"
      />

      <StepList steps={steps} entryStepId={def.entryStepId} />

      <WorkflowsDetail.Section.Render>
        {(s) => (
          <Surface key={s.id} level="raised" as="section" className="p-lg">
            {/* eslint-disable-next-line spacing/no-adhoc-spacing -- section title offset inside a bg/border/padded card, not a flex-gap sibling */}
            <Text as="h2" variant="label" className="mb-3">{s.title}</Text>
            <s.component definitionId={definitionId} />
          </Surface>
        )}
      </WorkflowsDetail.Section.Render>
    </Stack>
  );
}

function StepList({
  steps,
  entryStepId,
}: {
  steps: DefinitionStep[];
  entryStepId: string | null;
}) {
  const stepTypes = useStepTypeIndex();

  return (
    <Stack gap="sm">
      <Text as="h2" variant="label">Steps</Text>
      {steps.length === 0 ? (
        <Text as="div" variant="body" className="text-muted-foreground">
          No steps defined yet.
        </Text>
      ) : (
        <Stack gap="xs">
          {steps.map((step) => {
            const stepType = stepTypes.get(step.pluginId);
            const Icon = stepType?.icon;
            const summary = stepSummary(step);
            return (
              <Surface key={step.id} level="raised" as="div" className="p-sm">
                <Stack as="div" direction="row" align="center" justify="between" gap="sm">
                  <Stack as="span" direction="row" align="center" gap="sm">
                    {Icon ? <Icon className="size-4 text-muted-foreground" /> : null}
                    <Text as="span" variant="body">{step.label || stepType?.label || step.pluginId}</Text>
                    {step.id === entryStepId ? (
                      <Stack as="span" direction="row" align="center" gap="2xs" className="text-info">
                        <MdRadioButtonChecked className="size-3.5" />
                        <Text as="span" variant="caption">Entry</Text>
                      </Stack>
                    ) : null}
                  </Stack>
                  {summary ? (
                    <Text as="span" variant="caption" className="text-muted-foreground">
                      {summary}
                    </Text>
                  ) : null}
                </Stack>
              </Surface>
            );
          })}
        </Stack>
      )}
    </Stack>
  );
}

function stepSummary(step: DefinitionStep): string | null {
  if (step.nextStepMapping) {
    const entries = Object.entries(step.nextStepMapping);
    if (entries.length > 0) {
      return entries.map(([k, v]) => `${k} → ${v}`).join(", ");
    }
  }
  if (step.next) return `next → ${step.next}`;
  return null;
}
