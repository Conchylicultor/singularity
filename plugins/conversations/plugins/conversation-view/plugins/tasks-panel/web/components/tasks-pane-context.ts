import { createContext } from "react";

interface TasksPaneState {
  viewRootId: string;
  setViewRootId: (id: string) => void;
  setSelectedId: (id: string) => void;
}

export const TasksPaneContext = createContext<TasksPaneState | null>(null);
