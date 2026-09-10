import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { useTodoTask, useTodoTaskState } from "./hooks";
export type { TodoTaskState } from "./hooks";
export { TodoDispatch } from "./components/todo-dispatch";
export { TodoRuns } from "./components/todo-runs";
export type { TodoTaskLink } from "../shared/schemas";

export default {
  description:
    "Reads the task a TODO card was dispatched onto (useTodoTask / useTodoTaskState, joined live to the tasks resource; the runs come from tasks-core's useTaskConversations) and renders the card's two dispatched surfaces — the dispatch panel behind its name, and the chips at its foot, one per run. Contributes no slot of its own; the todo card's anchor, rail menu and foot host them.",
} satisfies PluginDefinition;
