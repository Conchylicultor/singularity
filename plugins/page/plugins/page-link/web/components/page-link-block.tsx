import { useMemo, useState } from "react";
import { MdDescription, MdLink } from "react-icons/md";
import { Row } from "@plugins/primitives/plugins/row/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { SearchInput } from "@plugins/primitives/plugins/search/web";
import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";
import { pagesResource, pageData, type Block } from "@plugins/page/plugins/editor/core";
import { useBlockEditor, type BlockRendererProps } from "@plugins/page/plugins/editor/web";
import { pageLinkBlock } from "../../core";

// A small page-picker popover: filterable list of pages fed by the live
// pagesResource. Selecting a page invokes `onSelect(pageId)`.
function PagePicker({
  trigger,
  onSelect,
}: {
  trigger: React.ReactElement;
  onSelect: (pageId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const result = useResource(pagesResource);

  const filtered = useMemo(() => {
    const pages = result.pending ? [] : result.data;
    const q = query.trim().toLowerCase();
    if (!q) return pages;
    return pages.filter((d) =>
      (pageData(d).title || "Untitled").toLowerCase().includes(q),
    );
  }, [result, query]);

  return (
    <InlinePopover
      trigger={trigger}
      open={open}
      onOpenChange={setOpen}
      contentClassName="w-72 p-2"
    >
      <div className="flex flex-col gap-2">
        <SearchInput
          autoFocus
          placeholder="Search pages…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <ul className="flex max-h-64 flex-col gap-0.5 overflow-y-auto">
          {filtered.length === 0 ? (
            <li className="px-2 py-1">
              <Placeholder>No pages found</Placeholder>
            </li>
          ) : (
            filtered.map((page) => (
              <li key={page.id}>
                <Row
                  hover="muted"
                  onClick={() => {
                    onSelect(page.id);
                    setOpen(false);
                    setQuery("");
                  }}
                  icon={<PageIcon page={page} />}
                >
                  <span className="truncate">
                    {pageData(page).title || "Untitled"}
                  </span>
                </Row>
              </li>
            ))
          )}
        </ul>
      </div>
    </InlinePopover>
  );
}

function PageIcon({ page }: { page: Block }) {
  return (
    <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
      {pageData(page).icon ?? <MdDescription className="size-4" />}
    </span>
  );
}

export function PageLinkBlock({ block, editor }: BlockRendererProps) {
  const { pageId } = pageLinkBlock.parse(block.data);
  const { onOpenPage } = useBlockEditor();
  const result = useResource(pagesResource);

  const target = useMemo(
    () => (result.pending ? undefined : result.data.find((d) => d.id === pageId)),
    [result, pageId],
  );
  const targetData = target ? pageData(target) : undefined;

  // Freshly inserted (empty) block: render the picker affordance.
  if (pageId === "") {
    return (
      <div className="px-3 py-1">
        <PagePicker
          onSelect={(id) => editor.update({ pageId: id })}
          trigger={
            <Row
              hover="muted"
              className="text-muted-foreground"
              icon={<MdLink className="size-4" />}
            >
              Select a page…
            </Row>
          }
        />
      </div>
    );
  }

  // Target page was deleted: offer a muted not-found row that re-opens the picker.
  if (!result.pending && !target) {
    return (
      <div className="px-3 py-1">
        <PagePicker
          onSelect={(id) => editor.update({ pageId: id })}
          trigger={
            <Row
              hover="muted"
              icon={<MdLink className="size-4 text-muted-foreground" />}
            >
              <Placeholder>(page not found)</Placeholder>
            </Row>
          }
        />
      </div>
    );
  }

  // Resolved link: a clickable chip/row that navigates via the host callback.
  return (
    <div className="px-3 py-1">
      <Row
        hover="muted"
        onClick={() => onOpenPage?.(pageId)}
        icon={
          <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
            {targetData?.icon ?? <MdLink className="size-4" />}
          </span>
        }
      >
        <span className="truncate font-medium underline-offset-2 hover:underline">
          {targetData?.title || "Untitled"}
        </span>
      </Row>
    </div>
  );
}
