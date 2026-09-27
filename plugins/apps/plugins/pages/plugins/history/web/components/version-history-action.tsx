import { useState } from "react";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { VersionHistoryDialog } from "@plugins/history/plugins/dialog/web";
import { pageDetailPane } from "@plugins/apps/plugins/pages/plugins/page-tree/web";
import { PageVersionPreview } from "./page-version-preview";
import { symbol } from "@plugins/ui/plugins/icons/core";

const historyIcon = symbol("history");

/**
 * "Version history" header action contributed to `pageDetailPane.Actions`.
 * Mirrors `StarHeaderAction`: an IconButton that opens the reusable
 * VersionHistoryDialog scoped to the pages source, injecting the diffed page
 * preview as `renderPreview`.
 */
export function VersionHistoryAction() {
  const { pageId } = pageDetailPane.useParams();
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton
        icon={historyIcon}
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
