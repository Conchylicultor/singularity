import { useMemo, useState } from "react";
import { MdLink } from "react-icons/md";
import { Row } from "@plugins/primitives/plugins/row/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { InlinePopover } from "@plugins/primitives/plugins/popover/web";
import { SearchInput } from "@plugins/primitives/plugins/search/web";
import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";
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
  const options = usePageOptions(query);

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
        <div className="max-h-64 overflow-y-auto">
          <PageOptionsList
            options={options}
            activeIndex={activeIndex}
            onHoverIndex={setActiveIndex}
            onSelect={(id) => {
              onSelect(id);
              setOpen(false);
              setQuery("");
            }}
          />
        </div>
      </div>
    </InlinePopover>
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

  // Freshly inserted (empty) block: render the picker affordance, opened.
  if (pageId === "") {
    return (
      <div className="px-3 py-1">
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

  // Target page was deleted: offer a muted not-found row that re-opens the picker.
  if (!result.pending && !target) {
    return (
      <div className="px-3 py-1">
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
    <div className="px-3 py-1">
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
