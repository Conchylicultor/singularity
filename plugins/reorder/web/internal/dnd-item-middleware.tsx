import { useContext, type ReactNode } from "react";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { useEditMode } from "./edit-mode-store";
import { ReorderEffectiveEditModeContext } from "./effective-edit-mode";
import { ReorderItemClaimContext } from "./item-claim";
import { contributionKey, contributionLabel } from "./sorting";
import {
  ReorderAreaContext,
  SortableReorderItem,
} from "@plugins/reorder/plugins/editor/web";

export function ReorderItemMiddleware({
  contribution,
  children,
}: {
  slotId: string;
  contribution: Contribution;
  children: ReactNode;
}) {
  const globalEditMode = useEditMode();
  const override = useContext(ReorderEffectiveEditModeContext);
  const editMode = override ?? globalEditMode;
  const ctx = useContext(ReorderAreaContext);
  // The claim is CONSUMED here, whichever branch we take below, and re-provided
  // as `false` around the result. Being merely inside an area's subtree is not
  // membership: only the area's own `renderItem` hands out a claim.
  const claimed = useContext(ReorderItemClaimContext);

  // A plain function, not a component: it must add no fiber of its own, so the
  // element chain from the provider down to the contribution stays constant.
  function renderBody(): ReactNode {
    // Not an item of any area: either no area above at all, or an area above but
    // no claim from it (a nested `.Dispatch` / `renderIsolated`, which mounts no
    // area of its own).
    if (!ctx || !claimed) return <>{children}</>;

    // Display-only override (popover regime's inline render): render the
    // contribution bare. Crucially this skips `SortableReorderItem`/`useSortable`,
    // which would otherwise need a `SortableContext` the inline render never mounts.
    if (override === false) return <>{children}</>;

    const key = contributionKey(contribution);
    if (!key) return <>{children}</>;

    const excluded = (contribution as Record<string, unknown>).excludeFromReorder;
    if (excluded) return <>{children}</>;

    const fill = !!(contribution as Record<string, unknown>).reorderFill;

    const label =
      (contribution as Record<string, unknown>).label as string | undefined
      ?? contributionLabel(contribution);

    return (
      <SortableReorderItem
        itemKey={key}
        editMode={editMode}
        label={label}
        fill={fill}
      >
        {children}
      </SortableReorderItem>
    );
  }

  // Rendered UNCONDITIONALLY, around EVERY branch — never `claimed ? <Provider>
  // … : <>…`. Two independent reasons, both load-bearing:
  //
  //  - The reset must cover the bail-outs too. An `excludeFromReorder`
  //    contribution consumes its claim just the same; otherwise a slot nested
  //    inside it would pick the claim up and re-open the leak on that path.
  //  - The element TYPE at this position must not depend on state. This
  //    middleware sits on an ancestor of `<LexicalComposer>`, so a type flip here
  //    remounts the editor and drops the user's caret — the hazard already
  //    documented at `plugins/page/plugins/editor/web/slots.ts:72-81`.
  return (
    <ReorderItemClaimContext.Provider value={false}>
      {renderBody()}
    </ReorderItemClaimContext.Provider>
  );
}
