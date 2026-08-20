import { type ReactElement } from "react";
import { MdDeleteOutline } from "react-icons/md";
import { defineItemActions } from "@plugins/primitives/plugins/data-view/web";
import type { ItemActionProps } from "@plugins/primitives/plugins/data-view/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { useDeleteComposition } from "@plugins/build/plugins/serve-composition/web";
import { MAIN_COMPOSITION_ID } from "@plugins/infra/plugins/namespace/core";
import { type CompositionManifestItem } from "@plugins/plugin-meta/plugins/composition/core";

/** Per-consumer trailing-action slot for the Compositions list rows. */
export const CompositionItemActions =
  defineItemActions<CompositionManifestItem>();

/**
 * Delete a stored composition — the row AND everything it is serving. Both are
 * `useDeleteComposition`'s job: it asks what the composition owns, names it in a
 * confirm dialog, and reclaims it before the row goes. The draft editor's own
 * Delete button calls the same hook (it additionally clears the loaded draft), so
 * the two cannot drift.
 *
 * The button pends while that inventory read is in flight, which is the honest
 * state — until the server answers, we do not know whether this delete is free or
 * destroys a live database.
 *
 * Main's row gets no button at all rather than a disabled one. A disabled control
 * says "not right now"; deleting the composition the repo itself builds is not a
 * thing that becomes available later, and `remove` throws on it.
 */
export function DeleteAction({
  row,
}: ItemActionProps<CompositionManifestItem>): ReactElement | null {
  const { deleteComposition } = useDeleteComposition();
  if (row.id === MAIN_COMPOSITION_ID) return null;
  return (
    <IconButton
      icon={MdDeleteOutline}
      label="Delete composition"
      onClick={(e) => {
        e.stopPropagation();
        // Returned so the button auto-pends for the inventory read. It never
        // rejects, and it hands the dialog off rather than awaiting it.
        return deleteComposition({ id: row.id, name: row.name });
      }}
    />
  );
}
