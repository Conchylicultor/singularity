// Domain types for the tasks/attempts FK cluster, surfaced through the `tasks`
// umbrella barrel for existing consumers. They originate in `tasks-core/core`;
// this internal re-export keeps `@plugins/tasks/core` a convenient type source
// without the umbrella *barrel* directly re-exporting another plugin's symbols
// (which the plugin-boundaries check forbids on `index.ts`). The live-state
// descriptors do NOT pass through here — consumers import those straight from
// `@plugins/tasks/plugins/tasks-core/core`.
export type {
  Attempt,
  AttemptWithConversations,
  ConversationSummary,
  Push,
  Task,
  TaskListItem,
} from "@plugins/tasks/plugins/tasks-core/core";
