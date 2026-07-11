import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { handleList } from "./internal/handle-list";
import { handleCreate } from "./internal/handle-create";
import { handleCreateChain } from "./internal/handle-create-chain";
import { handleClearAutoStart } from "./internal/handle-clear-auto-start";
import { handleSetAutoStart } from "./internal/handle-set-auto-start";
import { handleGet } from "./internal/handle-get";
import { handleUpdate } from "./internal/handle-update";
import {
  handleAddDependency,
  handleRemoveDependency,
} from "./internal/handle-dependencies";
import { handleInsertBetween } from "./internal/handle-insert-between";
import { handleDepsMove } from "./internal/handle-deps-move";
import { handleRepoInfo } from "./internal/handle-repo-info";
import { pushIngestJob, pushReconcileWarmup } from "./internal/push-watcher";
import { Trigger } from "@plugins/infra/plugins/events/server";
import { refAdvanced } from "@plugins/infra/plugins/git-watcher/server";
import { ContainerTask } from "@plugins/tasks/plugins/container-tasks/server";
import { CONVERSATIONS_META_TASK_ID } from "@plugins/tasks/plugins/tasks-core/server";
import {
  backfillConversationsMetaParent,
  ensureConversationsMetaTask,
} from "./internal/meta-conversations";
import { addTaskTool } from "./internal/mcp-tools";
import {
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
  moveTaskInDepsTree,
  getRepoInfo,
} from "../core/endpoints";

export { armTaskAutoStart } from "./internal/arm-auto-start";

export default {
  description: "Nested tasks with attempts linking to conversations.",
  httpRoutes: {
    [listTasks.route]: handleList,
    [createTask.route]: handleCreate,
    [createTaskChain.route]: handleCreateChain,
    [insertTaskBetween.route]: handleInsertBetween,
    [getTask.route]: handleGet,
    [updateTask.route]: handleUpdate,
    [setTaskAutoStart.route]: handleSetAutoStart,
    [clearTaskAutoStart.route]: handleClearAutoStart,
    [addTaskDependency.route]: handleAddDependency,
    [removeTaskDependency.route]: handleRemoveDependency,
    [moveTaskInDepsTree.route]: handleDepsMove,
    [getRepoInfo.route]: handleRepoInfo,
  },
  register: [addTaskTool, pushIngestJob, pushReconcileWarmup],
  contributions: [
    Trigger({ on: refAdvanced.where({ refName: "refs/heads/main" }), do: pushIngestJob, with: {}, oneShot: false }),
    ContainerTask({ id: CONVERSATIONS_META_TASK_ID }),
  ],
  onReady: async () => {
    const created = await ensureConversationsMetaTask();
    if (created) {
      await backfillConversationsMetaParent();
    }
    // The one-shot boot reconcile now runs as the host-scoped
    // `tasks.push-reconcile` warm-up (main-only, deferred + throttled). The
    // git-watcher trigger keeps ingestion live from this point forward.
  },
} satisfies ServerPluginDefinition;
