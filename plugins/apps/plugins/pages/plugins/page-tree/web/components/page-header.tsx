import type { Ref, RefObject } from "react";
import {
  useResource,
  ResourceView,
} from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { useEditableField } from "@plugins/primitives/plugins/editable-field/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import {
  pagesResource,
  pageData,
  updateBlock,
  type Block,
} from "@plugins/page/plugins/editor/core";
import type {
  BlockEditorHandle,
  CaretSurface,
} from "@plugins/page/plugins/editor/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  hoverRevealGroup,
  hoverRevealTarget,
} from "@plugins/primitives/plugins/hover-reveal/web";
import { RegenerateIconAction } from "@plugins/apps/plugins/pages/plugins/auto-icon/web";
import { PageIconButton } from "./page-icon-button";
import { PageTitle } from "./page-title";
import {
  PageDetail,
  type PageHeaderPart,
  type PageHeaderPartProps,
} from "../slots";
import { useSavePageData } from "../internal/use-save-page-data";
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
        return (
          <PageHeaderInner
            pageId={pageId}
            page={page}
            body={body}
            titleRef={titleRef}
          />
        );
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

  return (
    // `group/header` drives the hover-revealed tool row. The header owns no
    // horizontal geometry: the enclosing `PageContentColumn` already places it on
    // the block editor's content edge, so the title `<input>` below sits directly
    // on that edge with no padding of its own. When a cover is present the large
    // icon rises to overlap its bottom edge (a one-off visual overlap the spacing
    // ramp doesn't model — applied via inline negative margin, never a margin
    // utility).
    <Stack gap="xs" className={cn(hoverRevealGroup, "group/header pt-lg")}>
      {page && data?.icon != null && (
        <HeaderIcon page={page} raised={hasCover} />
      )}

      {/* The hover row: every contributed header tool, each gated on what the
          page already has (Add icon / Change icon / Add cover). A page the list
          does not hold has nothing to add to. */}
      {page && (
        <Stack direction="row" gap="2xs" className={hoverRevealTarget}>
          <PageDetail.HeaderTool.Render>
            {(part) => <HeaderPart part={part} entity={{ pageId, page }} />}
          </PageDetail.HeaderTool.Render>
        </Stack>
      )}

      <PageTitle field={title} body={body} ref={titleRef} />

      {page && (
        <PageDetail.UnderTitle.Render>
          {(part) => <HeaderPart part={part} entity={{ pageId, page }} />}
        </PageDetail.UnderTitle.Render>
      )}
    </Stack>
  );
}

/** The large page icon over the title, opening the icon picker. */
function HeaderIcon({ page, raised }: { page: Block; raised: boolean }) {
  const save = useSavePageData(page);
  return (
    <PageIconButton
      value={{ icon: pageData(page).icon ?? null }}
      onChange={(next) => save({ icon: next.icon })}
      footerActions={() => <RegenerateIconAction pageId={page.id} />}
      className="relative z-raised"
      style={raised ? { marginTop: "-3.5rem" } : undefined}
    />
  );
}

/**
 * One header contribution, behind its `useAvailable` gate. The branch is on the
 * hook's PRESENCE (stable per contribution), so both leaves stay rules-of-hooks
 * clean — the same split `defineDetailSections` makes for `Section`.
 */
function HeaderPart({
  part,
  entity,
}: {
  part: PageHeaderPart;
  entity: PageHeaderPartProps;
}) {
  if (part.useAvailable) {
    return (
      <GatedHeaderPart
        useAvailable={part.useAvailable}
        Part={part.component}
        entity={entity}
      />
    );
  }
  const Part = part.component;
  return <Part {...entity} />;
}

function GatedHeaderPart({
  useAvailable,
  Part,
  entity,
}: {
  useAvailable: NonNullable<PageHeaderPart["useAvailable"]>;
  Part: PageHeaderPart["component"];
  entity: PageHeaderPartProps;
}) {
  return useAvailable(entity) ? <Part {...entity} /> : null;
}
