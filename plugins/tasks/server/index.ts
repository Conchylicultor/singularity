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
import { handleRepoInfo } from "./internal/handle-repo-info";
import { handleTaskAttachments } from "./internal/handle-task-attachments";
import { pushIngestJob, runInitialReconcile } from "./internal/push-watcher";
import { Trigger } from "@plugins/infra/plugins/events/server";
import { refAdvanced } from "@plugins/infra/plugins/git-watcher/server";
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
  getTaskAttachments,
  setTaskAutoStart,
  clearTaskAutoStart,
  addTaskDependency,
  removeTaskDependency,
  getRepoInfo,
} from "../core/endpoints";

export { armTaskAutoStart } from "./internal/arm-auto-start";

export default {
  name: "Tasks",
  description: "Nested tasks with attempts linking to conversations.",
  httpRoutes: {
    [listTasks.route]: handleList,
    [createTask.route]: handleCreate,
    [createTaskChain.route]: handleCreateChain,
    [insertTaskBetween.route]: handleInsertBetween,
    [getTask.route]: handleGet,
    [updateTask.route]: handleUpdate,
    [getTaskAttachments.route]: handleTaskAttachments,
    [setTaskAutoStart.route]: handleSetAutoStart,
    [clearTaskAutoStart.route]: handleClearAutoStart,
    [addTaskDependency.route]: handleAddDependency,
    [removeTaskDependency.route]: handleRemoveDependency,
    [getRepoInfo.route]: handleRepoInfo,
  },
  register: [addTaskTool, pushIngestJob],
  contributions: [
    Trigger({ on: refAdvanced.where({ refName: "refs/heads/main" }), do: pushIngestJob, with: {}, oneShot: false }),
  ],
  onReady: async () => {
    const created = await ensureConversationsMetaTask();
    if (created) {
      await backfillConversationsMetaParent();
    }
    // Reconcile catches any commits that landed while the server was down.
    // The git-watcher trigger keeps us live from this point forward.
    await runInitialReconcile();
  },
} satisfies ServerPluginDefinition;
