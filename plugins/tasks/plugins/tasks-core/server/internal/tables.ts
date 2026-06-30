import {
  type AnyPgColumn,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import {
  defineEntity,
  defaultNow,
} from "@plugins/infra/plugins/entities/server";
import { DEFAULT_MODEL } from "@plugins/conversations/plugins/model-provider/core";
import {
  taskFields,
  attemptFields,
  taskDependencyFields,
  pushFields,
  conversationFields,
} from "../../core/internal/fields";

// Physical tables only. This file is a load-order leaf: it must NOT import
// from any other plugin's schema/tables file so that cross-plugin schemas can
// depend on it without forming a cycle. Views, Zod schemas, and types live in
// `./schema.ts` (now a shim over `core/internal/schema.ts`). The
// model-provider/core import (DEFAULT_MODEL) is safe — it has zero plugin deps
// and introduces no cycle.
//
// These five tables form a single FK cluster and are co-located here to
// eliminate the cycle that existed when _conversations lived in the
// conversations plugin and imported _attempts from the tasks plugin.
//
// Each table is now defined through `defineEntity` (infra/entities), deriving
// the physical pgTable AND the base wire schema from one field record (in
// `core/internal/fields.ts`) so column/schema drift is unrepresentable. FK /
// cascade / set-null edges, DB defaults, and indexes are declared in the entity
// meta below, reproducing the previous raw-drizzle DDL byte-for-byte.

const tasksEntity = defineEntity("tasks", taskFields, {
  primaryKey: "id",
  columns: {
    folderId: {
      references: { column: (): AnyPgColumn => tasksEntity.table.id, onDelete: "cascade" },
    },
    groupId: {
      references: { column: (): AnyPgColumn => tasksEntity.table.id, onDelete: "set null" },
    },
    titleAuto: { default: true },
    expanded: { default: false },
    createdAt: { default: defaultNow() },
    updatedAt: { default: defaultNow() },
  },
  indexes: (t) => [
    index("tasks_folder_rank_idx").on(t.folderId, t.rank),
    index("tasks_group_id_idx").on(t.groupId),
  ],
});
export const _tasks = tasksEntity.table;

const attemptsEntity = defineEntity("attempts", attemptFields, {
  primaryKey: "id",
  columns: {
    taskId: {
      references: { column: () => tasksEntity.table.id, onDelete: "cascade" },
    },
    createdAt: { default: defaultNow() },
    updatedAt: { default: defaultNow() },
  },
  // tasks_v derives task status via per-task correlated subqueries on
  // attempts.task_id (has_attempt / has_completed / has_active / has_blocking_dep).
  // Without this index those run as full seq scans / nested-loop anti-joins over
  // all-history attempts on every tasks/attempts recompute.
  indexes: (t) => [index("attempts_task_id_idx").on(t.taskId)],
});
export const _attempts = attemptsEntity.table;

const taskDependenciesEntity = defineEntity("task_dependencies", taskDependencyFields, {
  primaryKey: ["taskId", "dependsOnTaskId"],
  columns: {
    taskId: {
      references: { column: () => tasksEntity.table.id, onDelete: "cascade" },
    },
    dependsOnTaskId: {
      references: { column: () => tasksEntity.table.id, onDelete: "cascade" },
    },
    createdAt: { default: defaultNow() },
  },
  indexes: (t) => [index("task_deps_depends_on_idx").on(t.dependsOnTaskId)],
});
export const _taskDependencies = taskDependenciesEntity.table;

const pushesEntity = defineEntity("pushes", pushFields, {
  primaryKey: "id",
  columns: {
    attemptId: {
      references: { column: () => attemptsEntity.table.id, onDelete: "cascade" },
    },
    // conversationId carries NO FK (soft attribution so the conversations table
    // can own its own lifecycle).
    createdAt: { default: defaultNow() },
  },
  indexes: (t) => [
    uniqueIndex("pushes_sha_unique").on(t.sha),
    index("pushes_push_id_idx").on(t.pushId),
    index("pushes_attempt_id_idx").on(t.attemptId),
  ],
});
// drizzle-kit schema-glob discovery. Name kept (no underscore) so consumers
// don't churn.
export const pushes = pushesEntity.table;

const conversationsEntity = defineEntity("conversations", conversationFields, {
  primaryKey: "id",
  columns: {
    attemptId: {
      references: { column: () => attemptsEntity.table.id, onDelete: "cascade" },
    },
    status: { default: "starting" },
    runtime: { default: "tmux" },
    model: { default: DEFAULT_MODEL },
    kind: { default: "user" },
    createdAt: { default: defaultNow() },
    updatedAt: { default: defaultNow() },
    closeRequested: { default: false },
  },
  // attempts_v / tasks_v derive status via per-attempt correlated subqueries on
  // conversations.attempt_id, several of them filtered by status (max_ended_at,
  // has_live_conv `status NOT IN ('gone','done')`, has_waiting `status='waiting'`).
  // The composite (attempt_id, status) serves both the bare attempt_id lookups
  // and the status-filtered ones; without it these are full seq scans of the
  // conversations table per attempt on every cascade.
  indexes: (t) => [
    index("conversations_attempt_id_status_idx").on(t.attemptId, t.status),
    // Backs the All-conversations DataView's default keyset (createdAt DESC, id
    // ASC tiebreaker) so the global list pages index-only at scale.
    index("conversations_created_id_idx").on(t.createdAt, t.id),
  ],
});
export const _conversations = conversationsEntity.table;
