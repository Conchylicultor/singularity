// The live-state descriptors moved to `tasks-core/core` (single source of truth
// with the server resources). Consumers import them directly from
// `@plugins/tasks/plugins/tasks-core/core` — not re-exported here. The domain
// types stay surfaced through this umbrella for existing consumers, via an
// internal re-export file (the barrel must not re-export another plugin's
// symbols directly — plugin-boundaries' cross-plugin-reexport rule).
export type {
  Attempt,
  AttemptWithConversations,
  ConversationSummary,
  Push,
  Task,
  TaskListItem,
} from "./types";
export {
  listTasks,
  createTask,
  createTaskChain,
  insertTaskBetween,
  getTask,
  updateTask,
  setTaskAutoStart,
  clearTaskAutoStart,
  addTaskDependency,
  removeTaskDependency,
  getRepoInfo,
  CreateTaskBodySchema,
  UpdateTaskBodySchema,
  InsertBetweenBodySchema,
  SetAutoStartBodySchema,
  AddDependencyBodySchema,
} from "./endpoints";
export type {
  CreateTaskBody,
  UpdateTaskBody,
  InsertBetweenBody,
  SetAutoStartBody,
  AddDependencyBody,
} from "./endpoints";
export {
  TaskChainTargetSchema,
  TaskChainRelateModeSchema,
  TaskChainRelateSchema,
  TaskChainLaunchSchema,
  TaskChainCardSchema,
  TaskChainSubmitBodySchema,
  TaskChainSubmitResponseSchema,
} from "./task-chain-types";
export type {
  TaskChainTarget,
  TaskChainRelate,
  TaskChainRelateMode,
  TaskChainLaunch,
  TaskChainCard,
  TaskChainSubmitBody,
  TaskChainSubmitResponse,
} from "./task-chain-types";
export { countTransitiveDependents } from "./utils";
