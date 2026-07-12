import { useState } from "react";
import {
  MdDeleteOutline,
  MdDescription,
  MdRestoreFromTrash,
  MdDeleteForever,
} from "react-icons/md";
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import {
  trashEntriesResource,
  restoreTrash,
  purgeTrash,
  type TrashEntry,
} from "@plugins/infra/plugins/trash/core";
// The pages trash source id — owned by the plugin that registers the source, so
// the server chokepoint and this dialog can never drift apart.
import { PAGES_TRASH_SOURCE } from "@plugins/page/plugins/editor/core";

/**
 * Sidebar "Trash" trigger: a Row that opens a dialog listing the pages that have
 * been soft-deleted. Each entry can be restored or permanently deleted; the
 * permanent delete is gated behind a confirm dialog (the FK cascade fires at
 * purge, so it is irreversible). The list updates live via the push
 * `trash-entries` resource — restore/purge just mutate and the row disappears.
 */
export function PagesTrash() {
  const [open, setOpen] = useState(false);
  const [confirmEntry, setConfirmEntry] = useState<TrashEntry | null>(null);
  const result = useResource(trashEntriesResource, { sourceId: PAGES_TRASH_SOURCE });
  const restore = useEndpointMutation(restoreTrash);
  const purge = useEndpointMutation(purgeTrash);

  const onRestore = (entry: TrashEntry) => {
    restore.mutate({ params: { sourceId: PAGES_TRASH_SOURCE, entryId: entry.id } });
  };

  const onConfirmPurge = () => {
    if (!confirmEntry) return;
    purge.mutate(
      { params: { sourceId: PAGES_TRASH_SOURCE, entryId: confirmEntry.id } },
      { onSuccess: () => setConfirmEntry(null) },
    );
  };

  return (
    <>
      <div className="px-xs pt-xs">
        <Row icon={<MdDeleteOutline />} onClick={() => setOpen(true)}>
          Trash
        </Row>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogTitle>Trash</DialogTitle>
          <DialogDescription>
            Deleted pages are kept for 30 days before being permanently removed.
          </DialogDescription>
          {result.pending ? (
            <Loading />
          ) : result.data.length === 0 ? (
            <Placeholder>Trash is empty</Placeholder>
          ) : (
            <Scroll axis="y" className="max-h-96">
              <Stack gap="2xs">
                {result.data.map((entry) => (
                  <Row
                    key={entry.id}
                    icon={<MdDescription />}
                    hover="muted"
                    actionsAlwaysVisible
                    actions={
                      <Inline gap="xs">
                        <Text variant="caption" tone="muted">
                          <RelativeTime date={entry.deletedAt} />
                        </Text>
                        <IconButton
                          icon={MdRestoreFromTrash}
                          label="Restore"
                          disabled={restore.isPending}
                          onClick={() => onRestore(entry)}
                        />
                        <IconButton
                          icon={MdDeleteForever}
                          label="Delete permanently"
                          disabled={purge.isPending}
                          onClick={() => setConfirmEntry(entry)}
                        />
                      </Inline>
                    }
                  >
                    <Text>{entry.label || "Untitled"}</Text>
                  </Row>
                ))}
              </Stack>
            </Scroll>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmEntry !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmEntry(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Delete permanently</DialogTitle>
          <DialogDescription>
            Permanently delete{" "}
            <span className="font-medium">
              {confirmEntry?.label || "Untitled"}
            </span>
            ? This removes the page and all of its content and cannot be undone.
          </DialogDescription>
          <Stack
            direction="row"
            justify="end"
            gap="sm"
            // eslint-disable-next-line spacing/no-adhoc-spacing -- action row offset below the dialog description; one-off dialog footer spacing
            className="mt-4"
          >
            <Button variant="ghost" onClick={() => setConfirmEntry(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={purge.isPending}
              onClick={() => onConfirmPurge()}
            >
              Delete permanently
            </Button>
          </Stack>
        </DialogContent>
      </Dialog>
    </>
  );
}
