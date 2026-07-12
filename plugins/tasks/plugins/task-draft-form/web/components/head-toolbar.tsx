import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { TaskDraftFormSlots } from "../slots";

/**
 * Action toolbar under the head card editor. Hosts the `TaskDraftForm.Action`
 * slot, handing each contribution an `insertText` that drops its snippet at the
 * editor's caret (end of document if the editor was never focused), so e.g.
 * several `<ui-context/>` chips can be attached mid-sentence, in a row. Renders
 * nothing when no plugin contributes an action.
 */
export function HeadToolbar({
  insertText,
}: {
  insertText: (text: string) => void;
}) {
  const items = TaskDraftFormSlots.Action.useContributions();
  if (items.length === 0) return null;
  return (
    <Stack direction="row" gap="xs" align="center" wrap className="pt-xs">
      <TaskDraftFormSlots.Action.Render>
        {(item) => <item.component insertText={insertText} />}
      </TaskDraftFormSlots.Action.Render>
    </Stack>
  );
}
