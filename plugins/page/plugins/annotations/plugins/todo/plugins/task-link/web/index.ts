import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { useTodoTask, useTodoTaskState } from "./hooks";
export type { TodoTaskState } from "./hooks";
export { TodoDispatch } from "./components/todo-dispatch";
export type { TodoTaskLink } from "../shared/schemas";

export default {
  description:
    "Reads the task a TODO card was dispatched onto (useTodoTask / useTodoTaskState, joined live to the tasks resource) and renders the card's dispatch panel — the launch form, and once dispatched the task's title, status and newest run. Contributes no slot of its own; the todo card's anchor and rail menu host it.",
} satisfies PluginDefinition;
