import { type ReactElement } from "react";
import { MdDeleteOutline } from "react-icons/md";
import { defineItemActions } from "@plugins/primitives/plugins/data-view/web";
import type { ItemActionProps } from "@plugins/primitives/plugins/data-view/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useManifestActions } from "@plugins/plugin-meta/plugins/composition/web";
import {
  MAIN_COMPOSITION_ID,
  type CompositionManifestItem,
} from "@plugins/plugin-meta/plugins/composition/core";

/** Per-consumer trailing-action slot for the Compositions list rows. */
export const CompositionItemActions =
  defineItemActions<CompositionManifestItem>(
    "studio.compositions.item-actions",
  );

/**
 * Delete a stored composition from the config registry. Independent of the draft
 * editor's own Delete button (which additionally clears the loaded draft) — this
 * is the lighter per-row affordance every DataView view renders in its hover
 * trailing slot.
 *
 * Main's row gets no button at all rather than a disabled one. A disabled
 * control says "not right now"; deleting the composition the repo itself builds
 * is not a thing that becomes available later, and `remove` throws on it.
 */
export function DeleteAction({
  row,
}: ItemActionProps<CompositionManifestItem>): ReactElement | null {
  const { remove } = useManifestActions();
  if (row.id === MAIN_COMPOSITION_ID) return null;
  return (
    <IconButton
      icon={MdDeleteOutline}
      label="Delete composition"
      onClick={(e) => {
        e.stopPropagation();
        remove(row.id);
      }}
    />
  );
}
