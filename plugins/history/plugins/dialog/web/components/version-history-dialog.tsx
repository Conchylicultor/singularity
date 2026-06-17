import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  ScrollArea,
} from "@plugins/primitives/plugins/ui-kit/web";
import { Surface } from "@plugins/primitives/plugins/css/plugins/surface/web";
import { Stack, Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { SectionLabel } from "@plugins/primitives/plugins/css/plugins/section-label/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { toast } from "@plugins/shell/plugins/notifications/web";
import { listVersions, restoreVersion } from "@plugins/history/plugins/engine/core";
import type { Version } from "@plugins/history/plugins/engine/core";
import { useVersionHistory } from "../internal/use-version-history";

export interface VersionHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** History source id (e.g. "pages"). */
  sourceId: string;
  /** The source's own id for the versioned entity (e.g. a page block id). */
  entityId: string;
  /**
   * Renders the snapshot preview for the active version. The host owns the
   * snapshot shape and rendering (e.g. a faithful diffed block view), keeping
   * this dialog fully domain-agnostic.
   */
  renderPreview: (version: Version) => ReactNode;
}

// One timeline row: relative time, optional author/label, and an inline Restore
// affordance. Selecting the row drives the preview; Restore opens confirmation.
function TimelineRow({
  version,
  selected,
  onSelect,
  onRestore,
}: {
  version: Version;
  selected: boolean;
  onSelect: () => void;
  onRestore: () => void;
}) {
  return (
    <Row
      selected={selected}
      onClick={onSelect}
      actions={
        <Button
          variant="ghost"
          size="xs"
          onClick={(e) => {
            e.stopPropagation();
            onRestore();
          }}
        >
          Restore
        </Button>
      }
    >
      <Stack gap="2xs" className="min-w-0">
        <Text as="span" variant="body" className="truncate">
          {version.label || "Version"}
        </Text>
        <Text as="span" variant="caption" tone="muted" className="truncate">
          <RelativeTime date={version.createdAt} />
          {version.pinned ? " · checkpoint" : ""}
          {version.author ? ` · ${version.author}` : ""}
        </Text>
      </Stack>
    </Row>
  );
}

export function VersionHistoryDialog({
  open,
  onOpenChange,
  sourceId,
  entityId,
  renderPreview,
}: VersionHistoryDialogProps) {
  const { data: versions, isLoading } = useVersionHistory(sourceId, entityId, {
    enabled: open,
  });
  const list = useMemo(() => versions ?? [], [versions]);

  const [activeId, setActiveId] = useState<string | null>(null);
  // Version pending a restore confirmation (null = no confirmation open).
  const [pendingRestore, setPendingRestore] = useState<Version | null>(null);

  // Default-select the newest version whenever the list (re)loads and the
  // current selection is gone (first open, or after a restore inserts a row).
  useEffect(() => {
    if (list.length === 0) {
      setActiveId(null);
      return;
    }
    if (!activeId || !list.some((v) => v.id === activeId)) {
      setActiveId(list[0]!.id);
    }
  }, [list, activeId]);

  const activeVersion = useMemo(
    () => list.find((v) => v.id === activeId) ?? null,
    [list, activeId],
  );

  const restore = useEndpointMutation(restoreVersion, {
    invalidates: [listVersions],
    onSuccess: () => {
      toast({
        type: "history",
        title: "Version restored",
        description: pendingRestore?.label || "The selected version is now live.",
        variant: "success",
      });
      setPendingRestore(null);
    },
  });

  const confirmRestore = () => {
    if (!pendingRestore) return;
    void restore.mutateAsync({
      params: { sourceId, entityId, versionId: pendingRestore.id },
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <Surface
            level="overlay"
            className="flex h-[32rem] w-full max-w-4xl flex-col overflow-hidden rounded-xl shadow-2xl"
          >
            <div className="border-b px-lg py-sm">
              <DialogTitle>Version history</DialogTitle>
              <DialogDescription>
                Browse past versions and restore any of them.
              </DialogDescription>
            </div>

            <div className="flex min-h-0 flex-1">
              {/* LEFT — timeline column, newest first. */}
              <div className="flex w-72 shrink-0 flex-col border-r">
                <Inset x="md" t="sm" b="2xs">
                  <SectionLabel>Timeline</SectionLabel>
                </Inset>
                <ScrollArea className="min-h-0 flex-1">
                  <Inset x="xs" b="xs">
                    {isLoading ? (
                      <Loading variant="rows" count={5} />
                    ) : list.length === 0 ? (
                      <Placeholder>No versions yet.</Placeholder>
                    ) : (
                      <Stack gap="2xs">
                        {list.map((version) => (
                          <TimelineRow
                            key={version.id}
                            version={version}
                            selected={version.id === activeId}
                            onSelect={() => setActiveId(version.id)}
                            onRestore={() => setPendingRestore(version)}
                          />
                        ))}
                      </Stack>
                    )}
                  </Inset>
                </ScrollArea>
              </div>

              {/* RIGHT — host-injected preview of the active version. */}
              <ScrollArea className="min-h-0 flex-1">
                {isLoading ? (
                  <Inset pad="lg">
                    <Loading variant="block" />
                  </Inset>
                ) : activeVersion ? (
                  renderPreview(activeVersion)
                ) : (
                  <Inset pad="lg">
                    <Placeholder>Select a version to preview it.</Placeholder>
                  </Inset>
                )}
              </ScrollArea>
            </div>
          </Surface>
        </DialogContent>
      </Dialog>

      {/* Restore confirmation — destructive-but-reversible. */}
      <Dialog
        open={pendingRestore !== null}
        onOpenChange={(o) => {
          if (!o) setPendingRestore(null);
        }}
      >
        <DialogContent>
          <DialogTitle>Restore this version?</DialogTitle>
          <DialogDescription>
            Your current page is saved as a version before restoring, so you can
            undo this.
          </DialogDescription>
          {/* eslint-disable-next-line spacing/no-adhoc-spacing -- action row offset below the dialog description; one-off dialog footer spacing */}
          <div className="mt-4 flex justify-end gap-sm">
            <Button
              variant="ghost"
              onClick={() => setPendingRestore(null)}
              disabled={restore.isPending}
            >
              Cancel
            </Button>
            <Button onClick={confirmRestore} loading={restore.isPending}>
              Restore
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
