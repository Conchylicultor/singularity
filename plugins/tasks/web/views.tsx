import { useState, useEffect } from "react";
import type { PaneDescriptor } from "@plugins/shell/web";
import { TasksPanel } from "./components/tasks-panel";

function getSelectedId() {
  return window.location.pathname.match(/^\/tasks\/([^/]+)$/)?.[1];
}

// Stable module-level component so openPane can detect same-type navigation
// and avoid remounting the panel (which would reset filter/scroll state).
function TasksPanelRoute() {
  const [selectedId, setSelectedId] = useState<string | undefined>(getSelectedId);

  useEffect(() => {
    const update = () => setSelectedId(getSelectedId());
    window.addEventListener("shell:navigate", update);
    window.addEventListener("popstate", update);
    return () => {
      window.removeEventListener("shell:navigate", update);
      window.removeEventListener("popstate", update);
    };
  }, []);

  return <TasksPanel selectedId={selectedId} />;
}

export function tasksPane(args?: { id?: string }): PaneDescriptor {
  const path = args?.id ? `/tasks/${args.id}` : "/tasks";
  return { title: "Tasks", component: TasksPanelRoute, path };
}
