import { insertIntoImproveDraft } from "@plugins/improve/web";
import { serializeUiContext } from "@plugins/primitives/plugins/ui-context/core";
import { PickerButton } from "./picker-button";

/**
 * ActionBar entry: pick an element, then insert it into the Improve draft,
 * opening the popover if it isn't already. Identical in effect to the in-form
 * `TaskDraftPickerButton` — one insertion, added to whatever is already drafted —
 * differing only in that this one doesn't need the popover open to start.
 */
export function ElementPickerButton() {
  return (
    <PickerButton
      onPick={(meta) => insertIntoImproveDraft(serializeUiContext(meta))}
    />
  );
}
