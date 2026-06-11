import { useResource, ResourceView } from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { useEditableField } from "@plugins/primitives/plugins/editable-field/web";
import { pagesResource, updateBlock, pageData, type Block } from "@plugins/page/plugins/editor/core";
import { PageIcon } from "@plugins/page/plugins/editor/web";

/**
 * Editable story title in the editor top bar. Mirrors the pages `PageHeader` but
 * title-only — the pages icon-button is a Pages-internal component we don't
 * import, so the icon is rendered read-only via `PageIcon`.
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

function StoryHeaderInner({ pageId, page }: { pageId: string; page: Block | undefined }) {
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
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <PageIcon nodes={data?.iconSvgNodes} className="size-5 shrink-0 text-muted-foreground" />
      <input
        value={title.value}
        onChange={(e) => title.onChange(e.target.value)}
        onFocus={title.onFocus}
        onBlur={title.onBlur}
        placeholder="Untitled"
        // `text-subheading` is the sanctioned typographic scale (the same utility
        // `<Text variant="subheading">` emits); it carries its own weight, so no
        // raw `font-semibold` / banned `text-lg` is needed on this <input>.
        className="min-w-0 flex-1 truncate bg-transparent text-subheading outline-none"
      />
    </div>
  );
}
