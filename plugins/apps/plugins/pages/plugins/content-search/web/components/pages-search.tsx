import { useState } from "react";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { PageIcon } from "@plugins/page/plugins/editor/web";
import { isSavedSymbolName } from "@plugins/ui/plugins/icons/plugins/saved-names/core";
import { QuickFindDialog } from "@plugins/search/plugins/quick-find/web";
import { pageDetailPane } from "@plugins/apps/plugins/pages/plugins/page-tree/web";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { Icon } from "@plugins/ui/plugins/icons/web";

const searchIcon = symbol("search");

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
        <Row icon={<Icon icon={searchIcon} />} onClick={() => setOpen(true)}>
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
        renderIcon={(r) => {
          // Search metadata is untyped JSON; the reindexer writes the page's
          // saved icon name under `icon`.
          const icon: unknown = r.metadata?.icon;
          return (
            <PageIcon
              icon={
                typeof icon === "string" && isSavedSymbolName(icon)
                  ? icon
                  : null
              }
              className="size-4"
            />
          );
        }}
      />
    </>
  );
}
