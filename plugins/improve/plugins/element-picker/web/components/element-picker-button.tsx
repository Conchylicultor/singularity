import { openImproveWithText } from "@plugins/improve/web";
import { serializeUiContext } from "../../core";
import { PickerButton } from "./picker-button";

/** ActionBar entry: pick an element, then open the Improve popover seeded with it. */
export function ElementPickerButton() {
  return (
    <PickerButton
      onPick={(meta) => openImproveWithText(serializeUiContext(meta))}
    />
  );
}
