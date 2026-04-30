import { useState, type ReactNode } from "react";
import { MdCallMerge } from "react-icons/md";
import { GroupContainer } from "./group-container";
import { GroupRename } from "./group-rename";

export function AutoGroupBox({
  clusterKey,
  title,
  rootConvIds,
  onRename,
  dragInProgress,
  children,
}: {
  clusterKey: string;
  title: string;
  rootConvIds: string[];
  onRename: (next: string) => void | Promise<void>;
  dragInProgress: boolean;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(`auto-group:collapsed:${clusterKey}`) === "1";
    } catch {
      return false;
    }
  });

  return (
    <GroupContainer
      droppableId={`drop-auto-group-${clusterKey}`}
      dropData={{ kind: "auto-group", rootConvIds, title }}
      dragInProgress={dragInProgress}
      expanded={!collapsed}
      onToggleExpanded={() => {
        setCollapsed((prev) => {
          const next = !prev;
          try {
            localStorage.setItem(
              `auto-group:collapsed:${clusterKey}`,
              next ? "1" : "0",
            );
          } catch {}
          return next;
        });
      }}
      leadingIcon={
        <MdCallMerge className="size-3.5 shrink-0 text-muted-foreground" />
      }
      title={<GroupRename value={title} onSave={onRename} />}
    >
      {children}
    </GroupContainer>
  );
}
