import { useContext, type ReactNode } from "react";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { useEditMode } from "./edit-mode-store";
import { contributionKey } from "./sorting";
import { ReorderAreaContext, SortableReorderItem } from "./dnd-components";

export function ReorderItemMiddleware({
  contribution,
  children,
}: {
  slotId: string;
  contribution: Contribution;
  children: ReactNode;
}) {
  const editMode = useEditMode();
  const ctx = useContext(ReorderAreaContext);

  const key = contributionKey(contribution);
  if (!key) return <>{children}</>;

  const excluded = (contribution as Record<string, unknown>).excludeFromReorder;
  if (excluded) return <>{children}</>;

  const wrapperClassName = (contribution as Record<string, unknown>)
    .reorderWrapperClassName as string | undefined;

  return (
    <SortableReorderItem
      itemKey={key}
      storageId={ctx?.storageId ?? ""}
      editMode={editMode}
      wrapperClassName={wrapperClassName}
    >
      {children}
    </SortableReorderItem>
  );
}
