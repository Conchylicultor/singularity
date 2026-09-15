import { insertIntoImproveDraft } from "@plugins/improve/web";
import { serializeUiContext } from "@plugins/primitives/plugins/ui-context/core";
import { PickerButton } from "@plugins/primitives/plugins/ui-context/plugins/element-picker/web";

/**
 * The Improve pill's picker segment (`[✦ Improve | ⌖]`): pick an element, then
 * insert it into the Improve draft, opening the popover if it isn't already.
 * Identical in effect to the in-form `TaskDraftPickerButton` — one insertion,
 * added to whatever is already drafted — differing only in that this one
 * doesn't need the popover open to start. Outlined, like the Improve button it
 * is joined to.
 */
export function ElementPickerButton() {
  return (
    <PickerButton
      variant="outline"
      onPick={(meta) =>
        insertIntoImproveDraft(serializeUiContext(meta, "picked"))
      }
    />
  );
}
