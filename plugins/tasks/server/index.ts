import type { ServerPluginDefinition } from "@server/types";
import { handleList } from "./internal/handle-list";
import { handleCreate } from "./internal/handle-create";
import { handleCreateChain } from "./internal/handle-create-chain";
import { handleClearAutoStart } from "./internal/handle-clear-auto-start";
import { handleSetAutoStart } from "./internal/handle-set-auto-start";
import { handleGet } from "./internal/handle-get";
import { handleUpdate } from "./internal/handle-update";
import { handleDelete } from "./internal/handle-delete";
import {
  handleAddDependency,
  handleRemoveDependency,
} from "./internal/handle-dependencies";
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

export { armTaskAutoStart } from "./internal/arm-auto-start";

export default {
  id: "tasks",
  name: "Tasks",
  description: "Nested tasks with attempts linking to conversations.",
  httpRoutes: {
    "GET /api/tasks": handleList,
    "POST /api/tasks": handleCreate,
    "POST /api/tasks/chain": handleCreateChain,
    "GET /api/tasks/:id": handleGet,
    "PATCH /api/tasks/:id": handleUpdate,
    "DELETE /api/tasks/:id": handleDelete,
    "GET /api/tasks/:id/attachments": handleTaskAttachments,
    "POST /api/tasks/:id/auto-start": handleSetAutoStart,
    "DELETE /api/tasks/:id/auto-start": handleClearAutoStart,
    "POST /api/tasks/:id/dependencies": handleAddDependency,
    "DELETE /api/tasks/:id/dependencies/:depId": handleRemoveDependency,
    "GET /api/repo-info": handleRepoInfo,
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
