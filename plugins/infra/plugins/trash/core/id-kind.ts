import { defineIdKind, type IdOf } from "@plugins/ids/core";

/**
 * One trash-ledger entry (`trash_entries.id`), declared once (`plugins/ids`).
 * A `uuid` kind, minted by `recordTrashEntry`. Domain rows point back at it as
 * a soft ref (`page_blocks.trash_entry_id`). `legacyBareUuid`: the bare-uuid
 * entries — and the soft refs to them — were prefixed (`trash-<uuid>`) by a
 * data migration, and `key` upgrades a bare uuid a stale client's undo stack
 * still holds.
 */
export const trashEntryIdKind = defineIdKind({
  prefix: "trash",
  label: "Trash entry",
  shape: "uuid",
  legacyBareUuid: true,
});

export type TrashEntryId = IdOf<typeof trashEntryIdKind>;
