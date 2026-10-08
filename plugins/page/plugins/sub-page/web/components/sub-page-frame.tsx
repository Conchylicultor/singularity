import { ContainerBackdrop } from "@plugins/page/plugins/container/web";
import { pageData } from "@plugins/page/plugins/editor/core";
import type { BlockFrameProps } from "@plugins/page/plugins/editor/web";
import { usePageReferenceTint } from "@plugins/page/plugins/page-reference/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

/**
 * The card an expanded special-kind page is drawn as (`isPageCard`): its
 * reference row and every line of its content under ONE wash — the same tint the
 * row wears collapsed, read through `PageReference.Decoration`, so this frame
 * names no kind and a new decorated kind is covered for free.
 *
 * `ContainerBackdrop` owns the geometry; this supplies the look only.
 */
export function SubPageFrame(props: BlockFrameProps) {
  const tintOf = usePageReferenceTint();
  return (
    <ContainerBackdrop
      frame={props}
      className={cn("rounded-md", tintOf(pageData({ data: props.data })))}
    />
  );
}
