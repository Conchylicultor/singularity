import type { TaskDraftActionProps } from "@plugins/tasks/plugins/task-draft-form/web";
import { serializeUiContext } from "../../core";
import { PickerButton } from "./picker-button";

/**
 * Draft-form entry: pick an element and inject its `<ui-context/>` tag into the
 * head card at the caret. Goes through `insertText` rather than the Improve
 * `OpenWithText` command, so it composes — pick several elements in a row and
 * each lands as its own chip, where the cursor was.
 */
export function TaskDraftPickerButton({ insertText }: TaskDraftActionProps) {
  return (
    <PickerButton
      label="Attach UI element"
      onPick={(meta) => insertText(serializeUiContext(meta))}
    />
  );
}
