import { useState } from "react";
import { MdSearch } from "react-icons/md";
import { Row } from "@plugins/primitives/plugins/row/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { PageIcon } from "@plugins/page/plugins/editor/web";
import type { SvgNode } from "@plugins/primitives/plugins/icon-picker/core";
import { QuickFindDialog } from "@plugins/search/plugins/quick-find/web";
import { pageDetailPane } from "@plugins/apps/plugins/pages/plugins/page-tree/web";

/**
 * Sidebar "Search" trigger: a Row that opens the reusable QuickFindDialog scoped
 * to the "pages" source. Selecting a result opens the page in the page-detail
 * pane.
 */
export function PagesSearch() {
  const [open, setOpen] = useState(false);
  const openPane = useOpenPane();

  return (
    <>
      <div className="px-xs pt-xs">
        <Row icon={<MdSearch />} onClick={() => setOpen(true)}>
          Search
        </Row>
      </div>
      <QuickFindDialog
        open={open}
        onOpenChange={setOpen}
        sources={["pages"]}
        placeholder="Search pages…"
        onSelect={(r) => {
          openPane(pageDetailPane, { pageId: r.entityId }, { mode: "push" });
          setOpen(false);
        }}
        renderIcon={(r) => (
          <PageIcon
            nodes={r.metadata?.iconSvgNodes as SvgNode[] | null | undefined}
            className="size-4"
          />
        )}
      />
    </>
  );
}
