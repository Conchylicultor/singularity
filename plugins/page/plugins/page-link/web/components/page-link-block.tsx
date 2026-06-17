import { useState } from "react";
import { MdLink } from "react-icons/md";
import { Row } from "@plugins/primitives/plugins/row/web";
import { Stack } from "@plugins/primitives/plugins/spacing/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { SearchInput } from "@plugins/primitives/plugins/search/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { pagesResource, pageData } from "@plugins/page/plugins/editor/core";
import {
  useBlockEditor,
  usePageOptions,
  PageOptionsList,
  PageIcon,
  type BlockRendererProps,
} from "@plugins/page/plugins/editor/web";
import { pageLinkBlock } from "../../core";

// A small page-picker popover: filterable list of pages fed by the live
// pagesResource (via the shared usePageOptions/PageOptionsList). Selecting a page
// invokes `onSelect(pageId)`. `autoOpen` opens it on mount so inserting the block
// is a single step (no extra click to reveal the picker).
function PagePicker({
  trigger,
  onSelect,
  autoOpen,
}: {
  trigger: React.ReactElement;
  onSelect: (pageId: string) => void;
  autoOpen?: boolean;
}) {
  const [open, setOpen] = useState(autoOpen ?? false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const pageOptionsResult = usePageOptions(query);

  return (
    <InlinePopover
      trigger={trigger}
      open={open}
      onOpenChange={setOpen}
      contentClassName="w-72 p-sm"
    >
      <Stack gap="sm">
        <SearchInput
          autoFocus
          placeholder="Search pages…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="max-h-64 overflow-y-auto">
          {pageOptionsResult.pending ? (
            <Loading variant="rows" />
          ) : (
            <PageOptionsList
              options={pageOptionsResult.options}
              activeIndex={activeIndex}
              onHoverIndex={setActiveIndex}
              onSelect={(id) => {
                onSelect(id);
                setOpen(false);
                setQuery("");
              }}
            />
          )}
        </div>
      </Stack>
    </InlinePopover>
  );
}

export function PageLinkBlock({ block, editor }: BlockRendererProps) {
  const { pageId } = pageLinkBlock.parse(block.data);
  const { onOpenPage } = useBlockEditor();
  const result = useResource(pagesResource);

  // Freshly inserted (empty) block: render the picker affordance, opened.
  // Show it even while pending — it has its own internal loading state.
  if (pageId === "") {
    return (
      <div className="px-md py-xs">
        <PagePicker
          autoOpen
          onSelect={(id) => editor.update({ pageId: id })}
          trigger={
            <Row
              hover="muted"
              className="text-muted-foreground"
              icon={<MdLink />}
            >
              Select a page…
            </Row>
          }
        />
      </div>
    );
  }

  // Gate: render nothing (inline block) while the pages resource is loading.
  if (result.pending) return null;

  const target = result.data.find((d) => d.id === pageId);
  const targetData = target ? pageData(target) : undefined;

  // Target page was deleted: offer a muted not-found row that re-opens the picker.
  if (!target) {
    return (
      <div className="px-md py-xs">
        <PagePicker
          onSelect={(id) => editor.update({ pageId: id })}
          trigger={
            <Row
              hover="muted"
              icon={<MdLink className="text-muted-foreground" />}
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
    <div className="px-md py-xs">
      <Row
        hover="muted"
        onClick={() => onOpenPage?.(pageId)}
        icon={
          <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
            <PageIcon nodes={targetData?.iconSvgNodes} fallback={MdLink} className="size-4" />
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
