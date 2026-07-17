import { type ReactElement } from "react";
import { MdDeleteOutline } from "react-icons/md";
import { defineItemActions } from "@plugins/primitives/plugins/data-view/web";
import type { ItemActionProps } from "@plugins/primitives/plugins/data-view/web";
import { RowActionButton } from "@plugins/primitives/plugins/row-actions/web";
import { useManifestActions } from "@plugins/plugin-meta/plugins/composition/web";
import type { CompositionManifestItem } from "@plugins/plugin-meta/plugins/composition/core";

/** Per-consumer trailing-action slot for the Compositions list rows. */
export const CompositionItemActions = defineItemActions<CompositionManifestItem>(
  "studio.compositions.item-actions",
);

/**
 * Delete a stored composition from the config registry. Independent of the draft
 * editor's own Delete button (which additionally clears the loaded draft) — this
 * is the lighter per-row affordance every DataView view renders in its hover
 * trailing slot.
 */
export function DeleteAction({
  row,
}: ItemActionProps<CompositionManifestItem>): ReactElement {
  const { remove } = useManifestActions();
  return (
    <RowActionButton
      icon={MdDeleteOutline}
      label="Delete composition"
      onClick={(e) => {
        e.stopPropagation();
        remove(row.id);
      }}
    />
  );
}
