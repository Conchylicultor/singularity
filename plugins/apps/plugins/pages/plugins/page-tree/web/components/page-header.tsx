import { useMemo } from "react";
import { MdDescription } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { useEditableField } from "@plugins/primitives/plugins/editable-field/web";
import { documentsResource, updateDocument } from "@plugins/page/plugins/editor/core";

export function PageHeader({ pageId }: { pageId: string }) {
  const result = useResource(documentsResource);
  const page = useMemo(
    () =>
      result.pending ? undefined : result.data.find((d) => d.id === pageId),
    [result, pageId],
  );

  const { mutateAsync } = useEndpointMutation(updateDocument);

  const title = useEditableField({
    value: page?.title ?? "",
    onSave: async (next) => {
      await mutateAsync({ params: { id: pageId }, body: { title: next } });
    },
  });

  return (
    <div className="flex items-center gap-2 px-1 pb-2">
      <span className="text-muted-foreground flex size-7 shrink-0 items-center justify-center text-xl">
        {page?.icon ? page.icon : <MdDescription className="size-6" />}
      </span>
      <input
        value={title.value}
        onChange={(e) => title.onChange(e.target.value)}
        onFocus={title.onFocus}
        onBlur={title.onBlur}
        placeholder="Untitled"
        className="flex-1 truncate bg-transparent text-2xl font-semibold outline-none"
      />
    </div>
  );
}
