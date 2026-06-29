import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { TasksSubtree } from "@plugins/tasks/plugins/task-list/web";
import { tasksResource } from "@plugins/tasks/plugins/tasks-core/core";
import { TaskNavigateProvider } from "../context";
import { TaskDetail } from "./task-detail";

export function TaskTreeDetail({
  rootTaskId,
  selectedId,
  onSelect,
}: {
  rootTaskId: string;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  useResource(tasksResource);

  return (
    <TaskNavigateProvider value={onSelect}>
      {/* Master/detail split: a percentage-capped, internally-scrolling task
          list above a flex-filling, scrolling detail pane. The list's
          max-h-[40%] must resolve against this flex-col's definite (h-full)
          height, so the list stays a DIRECT flex child — Column would wrap it
          in a shrink-0 div and the percentage would resolve to none. The root's
          min-h-0 (not banned) lets it shrink within PaneChrome's scroll body so
          the inner scroll regions engage. */}
      <Stack gap="none" className="h-full min-h-0">
        {/* eslint-disable-next-line layout/no-adhoc-layout -- rigid (shrink-0) list region; its max-h-[40%] resolves against the flex-col root above */}
        <Scroll axis="both" className="max-h-[40%] shrink-0 border-b p-sm">
          <TasksSubtree
            rootTaskId={rootTaskId}
            selectedId={selectedId}
            onSelect={onSelect}
          />
        </Scroll>
        <Scroll axis="both" fill>
          <TaskDetail key={selectedId} taskId={selectedId} />
        </Scroll>
      </Stack>
    </TaskNavigateProvider>
  );
}
