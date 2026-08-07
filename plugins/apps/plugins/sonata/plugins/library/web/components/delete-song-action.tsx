import { MdDelete } from "react-icons/md";
import { RowActionButton } from "@plugins/primitives/plugins/row-actions/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import type { ItemActionProps } from "@plugins/primitives/plugins/data-view/web";
import { deleteSong } from "../../core";
import type { Song } from "../../core";

/**
 * Per-row Delete action for the library. Contributed once into
 * `Library.SongActions`, so it appears in the gallery card's hover cluster AND
 * the table row's trailing one — the table's first delete. Left at the default
 * `"revealed"` zone: a destructive action does not belong painted at rest.
 * The click never activates the row (stopPropagation), so it can't open the
 * player on its way out.
 */
export function DeleteSongAction({ row }: ItemActionProps<Song>) {
  const { mutate: deleteSongMutation } = useEndpointMutation(deleteSong);
  return (
    <RowActionButton
      icon={MdDelete}
      label="Delete"
      onClick={(e) => {
        e.stopPropagation();
        deleteSongMutation({ params: { id: row.id } });
      }}
    />
  );
}
