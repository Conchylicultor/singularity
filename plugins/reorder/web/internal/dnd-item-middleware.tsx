import { useContext, type ReactNode } from "react";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { useEditMode } from "./edit-mode-store";
import { ReorderEffectiveEditModeContext } from "./effective-edit-mode";
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
  if (!ctx) return <>{children}</>;

  // Display-only override (popover regime's inline render): render the
  // contribution bare. Crucially this skips `SortableReorderItem`/`useSortable`,
  // which would otherwise need a `SortableContext` the inline render never mounts.
  if (override === false) return <>{children}</>;

  const key = contributionKey(contribution);
  if (!key) return <>{children}</>;

  const excluded = (contribution as Record<string, unknown>).excludeFromReorder;
  if (excluded) return <>{children}</>;

  const wrapperClassName = (contribution as Record<string, unknown>)
    .reorderWrapperClassName as string | undefined;

  const label =
    (contribution as Record<string, unknown>).label as string | undefined
    ?? contributionLabel(contribution);

  return (
    <SortableReorderItem
      itemKey={key}
      editMode={editMode}
      label={label}
      wrapperClassName={wrapperClassName}
    >
      {children}
    </SortableReorderItem>
  );
}
