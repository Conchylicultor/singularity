import { useResource, ResourceView } from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { useEditableField } from "@plugins/primitives/plugins/editable-field/web";
import { pagesResource, updateBlock, pageData, type Block } from "@plugins/page/plugins/editor/core";
import { PageIconButton, type PageIconValue } from "./page-icon-button";

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

  const saveIcon = async (next: PageIconValue) => {
    if (!page) return;
    await mutateAsync({
      params: { id: pageId },
      body: {
        data: { ...pageData(page), icon: next.icon, iconSvgNodes: next.iconSvgNodes },
      },
    });
  };

  return (
    <div className="flex items-center gap-2 px-1 pb-2">
      <PageIconButton
        value={{ icon: data?.icon ?? null, iconSvgNodes: data?.iconSvgNodes ?? null }}
        onChange={saveIcon}
      />
      <input
        value={title.value}
        onChange={(e) => title.onChange(e.target.value)}
        onFocus={title.onFocus}
        onBlur={title.onBlur}
        placeholder="Untitled"
        className="text-title flex-1 truncate bg-transparent outline-none"
      />
    </div>
  );
}
