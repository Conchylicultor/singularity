import { createContext } from "react";

interface TasksPaneState {
  viewRootId: string;
  selectedId: string;
  setViewRootId: (id: string) => void;
  setSelectedId: (id: string) => void;
}

// Selection + re-root context shared by the conversation-panel mode of
// taskDetailPane (inline tree + detail) and the chrome-header actions
// (go-to-parent / open-task) that read it. Plugin-private: never exported
// from the barrel — the actions and the pane body both live in task-detail.
export const TasksPaneContext = createContext<TasksPaneState | null>(null);
