import { useContext, type ReactNode } from "react";
import type { Contribution } from "@core";
import { useEditMode } from "./edit-mode-store";
import { contributionKey } from "./sorting";
import {
  ReorderAreaContext,
  ReorderItemThreeZone,
} from "./dnd-components";

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
  if (!editMode || excluded) return <>{children}</>;

  return (
    <ReorderItemThreeZone
      itemKey={key}
      storageId={ctx?.storageId ?? ""}
      insertionIndicator={ctx?.insertionIndicator ?? null}
      groupingIndicator={ctx?.groupingIndicator ?? null}
    >
      {children}
    </ReorderItemThreeZone>
  );
}
