import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useEditableField } from "@plugins/primitives/plugins/editable-field/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { DefinitionEditor } from "@plugins/apps/plugins/workflows/plugins/editor/web";
import {
  deleteDefinition,
  updateDefinition,
  type WorkflowDefinition,
} from "@plugins/apps/plugins/workflows/plugins/engine/core";
import { definitionsRootPane } from "../panes";
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

  return (
    // The identity block (name, description, step editor) is pane chrome, not a
    // section — it carries the pane's own `p-lg`. `WorkflowsDetail.Host` supplies
    // its own inset, so it sits BESIDE that padded stack rather than inside it;
    // nesting would inset every section card an extra `lg` from the title above.
    <Stack gap="none">
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

        <DefinitionEditor definitionId={definitionId} def={def} />
      </Stack>

      <WorkflowsDetail.Host definitionId={definitionId} />
    </Stack>
  );
}
