import { useState } from "react";
import { MdHistory } from "react-icons/md";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { VersionHistoryDialog } from "@plugins/history/plugins/dialog/web";
import { PageVersionPreview } from "./page-version-preview";

/**
 * "Version history" header action contributed to `PageDetail.HeaderActions`.
 * Mirrors `StarHeaderAction`: an IconButton that opens the reusable
 * VersionHistoryDialog scoped to the pages source, injecting the diffed page
 * preview as `renderPreview`.
 */
export function VersionHistoryAction({ pageId }: { pageId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton
        icon={MdHistory}
        label="Version history"
        onClick={() => setOpen(true)}
      />
      {open && (
        <VersionHistoryDialog
          open={open}
          onOpenChange={setOpen}
          sourceId="pages"
          entityId={pageId}
          renderPreview={(version) => (
            <PageVersionPreview pageId={pageId} versionId={version.id} />
          )}
        />
      )}
    </>
  );
}
