import {
  useResource,
  ResourceView,
} from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { useEditableField } from "@plugins/primitives/plugins/editable-field/web";
import {
  pagesResource,
  updateBlock,
  pageData,
  type Block,
} from "@plugins/page/plugins/editor/core";
import { PageIcon } from "@plugins/page/plugins/editor/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import {
  Fill,
  fillClasses,
} from "@plugins/primitives/plugins/css/plugins/fill/web";
import { rigidClass } from "@plugins/primitives/plugins/css/plugins/rigid/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

/**
 * Editable story title — the story editor pane's TITLE node
 * (`<PaneChrome title={…}>`), not a header contribution. Mirrors the pages
 * `PageHeader` but title-only: the pages icon-button is a Pages-internal
 * component we don't import, so the icon is rendered read-only via `PageIcon`.
 *
 * It sets no typography size of its own — `PaneChrome` wraps every title node in
 * the canonical pane-title baseline and the size is inherited from there.
 */
export function StoryHeader({ pageId }: { pageId: string }) {
  const result = useResource(pagesResource);
  return (
    <ResourceView resource={result} fallback={<Loading variant="rows" />}>
      {(pages) => {
        const page = pages.find((d) => d.id === pageId);
        return <StoryHeaderInner pageId={pageId} page={page} />;
      }}
    </ResourceView>
  );
}

function StoryHeaderInner({
  pageId,
  page,
}: {
  pageId: string;
  page: Block | undefined;
}) {
  const data = page ? pageData(page) : undefined;

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
    <Stack as={Fill} direction="row" gap="sm" align="center">
      <PageIcon
        nodes={data?.iconSvgNodes}
        className={cn("size-5 text-muted-foreground", rigidClass())}
      />
      <input
        value={title.value}
        onChange={(e) => title.onChange(e.target.value)}
        onFocus={title.onFocus}
        onBlur={title.onBlur}
        placeholder="Untitled"
        // No type scale here: this <input> is inside the pane's title node, whose
        // container owns the pane-title size and weight (see pane/CLAUDE.md,
        // "Title typography is container-owned"). Tailwind's preflight makes a
        // form control inherit both, so the field matches every other pane title.
        className={cn(fillClasses("x"), "truncate bg-transparent outline-none")}
      />
    </Stack>
  );
}
