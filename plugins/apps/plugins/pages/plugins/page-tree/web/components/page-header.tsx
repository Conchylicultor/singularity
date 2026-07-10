import type { Ref, RefObject } from "react";
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
import type { BlockEditorHandle, CaretSurface } from "@plugins/page/plugins/editor/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Button, cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { hoverRevealGroup, hoverRevealTarget } from "@plugins/primitives/plugins/hover-reveal/web";
import { PageIconButton, PageIconPicker, type PageIconValue } from "./page-icon-button";
import { ChangeCoverPopover } from "./change-cover-popover";
import { PageTitle } from "./page-title";
import "./page-header.css";

export function PageHeader({
  pageId,
  body,
  titleRef,
}: {
  pageId: string;
  /** The page body's caret surface, so the title can hand the caret down to it. */
  body?: RefObject<BlockEditorHandle | null>;
  /** The title's own caret surface, so the body can hand the caret back up. */
  titleRef?: Ref<CaretSurface>;
}) {
  const result = useResource(pagesResource);
  return (
    <ResourceView resource={result} fallback={<Loading variant="rows" />}>
      {(pages) => {
        const page = pages.find((d) => d.id === pageId);
        return <PageHeaderInner pageId={pageId} page={page} body={body} titleRef={titleRef} />;
      }}
    </ResourceView>
  );
}

function PageHeaderInner({
  pageId,
  page,
  body,
  titleRef,
}: {
  pageId: string;
  page: Block | undefined;
  body?: RefObject<BlockEditorHandle | null>;
  titleRef?: Ref<CaretSurface>;
}) {
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
    // `group/header` drives the hover-revealed affordance row. The header owns no
    // horizontal geometry: the enclosing `PageContentColumn` already places it on
    // the block editor's content edge, so the title `<input>` below sits directly
    // on that edge with no padding of its own. When a cover is present the large
    // icon rises to overlap its bottom edge (a one-off visual overlap the spacing
    // ramp doesn't model — applied via inline negative margin, never a margin
    // utility).
    <Stack gap="xs" className={cn(hoverRevealGroup, "group/header pt-lg")}>
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
          className={hoverRevealTarget}
        >
          {!hasIcon && (
            <PageIconPicker
              value={iconValue}
              onChange={saveIcon}
              trigger={
                <Button variant="ghost" className="text-muted-foreground">
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
                <Button variant="ghost" className="text-muted-foreground">
                  <MdImage />
                  Add cover
                </Button>
              }
            />
          )}
        </Stack>
      )}

      <PageTitle field={title} body={body} ref={titleRef} />
    </Stack>
  );
}
