import { MdImage, MdEmojiEmotions } from "react-icons/md";
import { useResource, ResourceView } from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { useEditableField } from "@plugins/primitives/plugins/editable-field/web";
import {
  pagesResource,
  updateBlock,
  pageData,
  type Block,
  type PageCover,
} from "@plugins/page/plugins/editor/core";
import { BLOCK_GUTTER } from "@plugins/page/plugins/editor/web";
import { Stack } from "@plugins/primitives/plugins/spacing/web";
import { Button } from "@plugins/primitives/plugins/ui-kit/web";
import { PageIconButton, PageIconPicker, type PageIconValue } from "./page-icon-button";
import { ChangeCoverPopover } from "./change-cover-popover";
import "./page-header.css";

export function PageHeader({ pageId }: { pageId: string }) {
  const result = useResource(pagesResource);
  return (
    <ResourceView resource={result} fallback={<Loading variant="rows" />}>
      {(pages) => {
        const page = pages.find((d) => d.id === pageId);
        return <PageHeaderInner pageId={pageId} page={page} />;
      }}
    </ResourceView>
  );
}

function PageHeaderInner({ pageId, page }: { pageId: string; page: Block | undefined }) {
  const data = page ? pageData(page) : undefined;
  const hasIcon = data?.iconSvgNodes != null && data.iconSvgNodes.length > 0;
  const hasCover = data?.cover != null;

  const { mutateAsync } = useEndpointMutation(updateBlock);

  const title = useEditableField({
    value: data?.title ?? "",
    onSave: async (next) => {
      if (!page) return;
      await mutateAsync({
        params: { id: pageId },
        body: { data: { ...pageData(page), title: next } },
      });
    },
  });

  const iconValue: PageIconValue = {
    icon: data?.icon ?? null,
    iconSvgNodes: data?.iconSvgNodes ?? null,
  };

  const saveIcon = async (next: PageIconValue) => {
    if (!page) return;
    await mutateAsync({
      params: { id: pageId },
      body: { data: { ...pageData(page), icon: next.icon, iconSvgNodes: next.iconSvgNodes } },
    });
  };

  const saveCover = async (next: PageCover) => {
    if (!page) return;
    await mutateAsync({
      params: { id: pageId },
      body: { data: { ...pageData(page), cover: next } },
    });
  };

  return (
    // `group/header` drives the hover-revealed affordance row. Content is inset
    // by BLOCK_GUTTER so the title and affordances line up with the block
    // editor's text column. When a cover is present the large icon rises to
    // overlap its bottom edge (a one-off visual overlap the spacing ramp doesn't
    // model — applied via inline negative margin, never a margin utility).
    <Stack gap="xs" className="group/header pt-lg" style={{ paddingLeft: BLOCK_GUTTER }}>
      {hasIcon && (
        <PageIconButton
          value={iconValue}
          onChange={saveIcon}
          className="relative z-raised"
          style={hasCover ? { marginTop: "-3.5rem" } : undefined}
        />
      )}

      {/* Hover affordance row — only rendered when there's something to add. */}
      {(!hasIcon || !hasCover) && (
        <Stack
          direction="row"
          gap="2xs"
          className="opacity-0 transition-opacity group-hover/header:opacity-100"
        >
          {!hasIcon && (
            <PageIconPicker
              value={iconValue}
              onChange={saveIcon}
              trigger={
                <Button variant="ghost" size="sm" className="text-muted-foreground">
                  <MdEmojiEmotions />
                  Add icon
                </Button>
              }
            />
          )}
          {!hasCover && (
            <ChangeCoverPopover
              current={null}
              onPick={saveCover}
              trigger={
                <Button variant="ghost" size="sm" className="text-muted-foreground">
                  <MdImage />
                  Add cover
                </Button>
              }
            />
          )}
        </Stack>
      )}

      <input
        value={title.value}
        onChange={(e) => title.onChange(e.target.value)}
        onFocus={title.onFocus}
        onBlur={title.onBlur}
        placeholder="Untitled"
        className="page-doc-title w-full truncate bg-transparent outline-none"
      />
    </Stack>
  );
}
