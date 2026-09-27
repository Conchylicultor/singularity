import { useState } from "react";

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
import {
  useLive,
  type LiveListResult,
} from "@plugins/network/plugins/live/web";
import {
  InfiniteScrollFooter,
  useInfiniteScroll,
} from "@plugins/primitives/plugins/cursor-pagination/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import {
  trashEntries,
  restoreTrash,
  purgeTrash,
  type TrashEntry,
} from "@plugins/infra/plugins/trash/core";
// The pages trash source id — owned by the plugin that registers the source, so
// the server chokepoint and this dialog can never drift apart.
import { PAGES_TRASH_SOURCE } from "@plugins/page/plugins/editor/core";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { Icon } from "@plugins/ui/plugins/icons/web";

const deleteIcon = symbol("delete");
const descriptionIcon = symbol("description");
const restoreFromTrashIcon = symbol("restore-from-trash");
const deleteForeverIcon = symbol("delete-forever");

/**
 * Sidebar "Trash" trigger: a Row that opens a dialog listing the pages that have
 * been soft-deleted. Each entry can be restored or permanently deleted; the
 * permanent delete is gated behind a confirm dialog (the FK cascade fires at
 * purge, so it is irreversible). The list updates live via the `trashEntries`
 * collection filtered to the pages source — restore/purge just mutate and the
 * row disappears. It shows the newest-deleted window and grows it when the
 * dialog is scrolled to its end.
 */
export function PagesTrash() {
  const [open, setOpen] = useState(false);
  const [confirmEntry, setConfirmEntry] = useState<TrashEntry | null>(null);
  const result = useLive(trashEntries, {
    where: { sourceId: PAGES_TRASH_SOURCE },
  });
  const restore = useEndpointMutation(restoreTrash);
  const purge = useEndpointMutation(purgeTrash);

  const onRestore = (entry: TrashEntry) => {
    restore.mutate({
      params: { sourceId: PAGES_TRASH_SOURCE, entryId: entry.id },
    });
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
        <Row icon={<Icon icon={deleteIcon} />} onClick={() => setOpen(true)}>
          Trash
        </Row>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md">
          <DialogTitle>Trash</DialogTitle>
          <DialogDescription>
            Deleted pages are kept for 30 days before being permanently removed.
          </DialogDescription>
          {result.pending ? (
            result.error ? (
              <Placeholder tone="error">
                Couldn&apos;t load the trash: {result.error.message}
              </Placeholder>
            ) : (
              <Loading />
            )
          ) : result.data.length === 0 ? (
            <Placeholder>Trash is empty</Placeholder>
          ) : (
            <TrashList
              list={result}
              restoring={restore.isPending}
              purging={purge.isPending}
              onRestore={onRestore}
              onPurge={setConfirmEntry}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmEntry !== null}
        onOpenChange={(o) => {
          if (!o) setConfirmEntry(null);
        }}
      >
        <DialogContent size="sm">
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

/**
 * The loaded window of the trash, growing by one page when its end scrolls into
 * view. Its own component so the grow observer mounts with the dialog's
 * content, and so sees the sentinel it watches.
 */
function TrashList({
  list,
  restoring,
  purging,
  onRestore,
  onPurge,
}: {
  list: Extract<LiveListResult<TrashEntry>, { pending: false }>;
  restoring: boolean;
  purging: boolean;
  onRestore: (entry: TrashEntry) => void;
  onPurge: (entry: TrashEntry) => void;
}) {
  const scroll = useInfiniteScroll({
    hasNextPage: list.canGrow,
    isFetchingNextPage: list.growing,
    isFetchNextPageError: false,
    fetchNextPage: list.loadMore,
    rootMargin: "200px",
  });
  return (
    <Scroll axis="y" className="max-h-96">
      <Stack gap="2xs">
        {/* eslint-disable-next-line data-view/no-adhoc-row-list -- modal trash dialog; revisit if Trash becomes a pane */}
        {list.data.map((entry) => (
          <Row
            key={entry.id}
            icon={<Icon icon={descriptionIcon} />}
            hover="muted"
            actionsAlwaysVisible
            actions={
              <Inline gap="xs">
                <Text variant="caption" tone="muted">
                  <RelativeTime date={entry.deletedAt} />
                </Text>
                <IconButton
                  icon={restoreFromTrashIcon}
                  label="Restore"
                  disabled={restoring}
                  onClick={() => onRestore(entry)}
                />
                <IconButton
                  icon={deleteForeverIcon}
                  label="Delete permanently"
                  disabled={purging}
                  onClick={() => onPurge(entry)}
                />
              </Inline>
            }
          >
            <Text>{entry.label || "Untitled"}</Text>
          </Row>
        ))}
      </Stack>
      <InfiniteScrollFooter handle={scroll} />
    </Scroll>
  );
}
