import {
  type AnyPgColumn,
  boolean,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { rankText } from "@plugins/primitives/plugins/rank/core";
import { DEFAULT_MODEL, type ConversationModel } from "@plugins/conversations/plugins/model-provider/core";
import type { ConversationStatus } from "../../core/conversation-status";

// Physical tables only. This file is a load-order leaf: it must NOT import
// from any other plugin's schema/tables file so that cross-plugin schemas can
// depend on it without forming a cycle. Views, Zod schemas, and types live in
// `./schema.ts`. The model-provider/shared import is safe — it has zero plugin
// deps and introduces no cycle.
//
// These five tables form a single FK cluster and are co-located here to
// eliminate the cycle that existed when _conversations lived in the
// conversations plugin and imported _attempts from the tasks plugin.

export const _tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    // Display-only organization hierarchy: any task can act as a "folder" for
    // tasks filed under it. This is NOT a dependency — it carries no execution
    // semantics. Ordering between tasks comes solely from the dependency DAG
    // (task_dependencies). Kept distinct so agents never confuse the two.
    folderId: text("folder_id").references((): AnyPgColumn => _tasks.id, {
      onDelete: "cascade",
    }),
    groupId: text("group_id").references((): AnyPgColumn => _tasks.id, {
      onDelete: "set null",
    }),
    title: text("title").notNull(),
    // Whether `title` is a machine-generated label (a Haiku/fallback summary of
    // the description) rather than a human-authored one. When true,
    // buildTaskPrompt omits the title from the launch prompt — it would only
    // duplicate the description it was derived from. Flipped to false on any
    // explicit title write (inline edit, MCP add_task, explicit API title).
    titleAuto: boolean("title_auto").notNull().default(true),
    description: text("description"),
    // "user" for UI-created tasks, a conversation id for agent-created ones.
    author: text("author"),
    droppedAt: timestamp("dropped_at", { withTimezone: true }),
    heldAt: timestamp("held_at", { withTimezone: true }),
    expanded: boolean("expanded").notNull().default(false),
    rank: rankText("rank").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("tasks_folder_rank_idx").on(t.folderId, t.rank),
    index("tasks_group_id_idx").on(t.groupId),
  ],
);

export const _attempts = pgTable(
  "attempts",
  {
    id: text("id").primaryKey(),
    taskId: text("task_id")
      .notNull()
      .references(() => _tasks.id, { onDelete: "cascade" }),
    worktreePath: text("worktree_path").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  // tasks_v derives task status via per-task correlated subqueries on
  // attempts.task_id (has_attempt / has_completed / has_active / has_blocking_dep).
  // Without this index those run as full seq scans / nested-loop anti-joins over
  // all-history attempts on every tasks/attempts recompute.
  (t) => [index("attempts_task_id_idx").on(t.taskId)],
);

export const _taskDependencies = pgTable(
  "task_dependencies",
  {
    taskId: text("task_id")
      .notNull()
      .references(() => _tasks.id, { onDelete: "cascade" }),
    dependsOnTaskId: text("depends_on_task_id")
      .notNull()
      .references(() => _tasks.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.taskId, t.dependsOnTaskId] }),
    index("task_deps_depends_on_idx").on(t.dependsOnTaskId),
  ],
);

export const pushes = pgTable(
  "pushes",
  {
    id: text("id").primaryKey(),
    attemptId: text("attempt_id")
      .notNull()
      .references(() => _attempts.id, { onDelete: "cascade" }),
    // Soft attribution to the conversation that ran the push (no FK so the
    // conversations table can own its own lifecycle).
    conversationId: text("conversation_id"),
    sha: text("sha").notNull(),
    pushId: text("push_id").notNull(),
    message: text("message").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("pushes_sha_unique").on(t.sha),
    index("pushes_push_id_idx").on(t.pushId),
    index("pushes_attempt_id_idx").on(t.attemptId),
  ],
);

// ConversationModel is imported from model-provider (zero-dep plugin, no cycle).
// ConversationStatus is imported from tasks-core/core/conversation-status (zero-dep leaf).
// "user"   = manually created via the UI / default path
// "agent"  = launched via the agents plugin (saved prompt + button click)
// "system" = code-spawned by a job/trigger — hidden from user-facing
//            list/recovery/attempt surfaces.
type ConversationKind = "user" | "agent" | "system";

export const _conversations = pgTable(
  "conversations",
  {
    id: text("id").primaryKey(),
    attemptId: text("attempt_id")
      .notNull()
      .references(() => _attempts.id, { onDelete: "cascade" }),
    title: text("title"),
    status: text("status").$type<ConversationStatus>().notNull().default("starting"),
    runtime: text("runtime").notNull().default("tmux"),
    model: text("model").$type<ConversationModel>().notNull().default(DEFAULT_MODEL),
    kind: text("kind").$type<ConversationKind>().notNull().default("user"),
    claudeSessionId: text("claude_session_id"),
    waitingFor: text("waiting_for"),
    spawnedBy: text("spawned_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    closeRequested: boolean("close_requested").notNull().default(false),
    // Hibernation lifecycle (orthogonal to `status`): `hibernatedAt` is set when
    // the live process is intentionally absent (idle-killed or lost to a reboot)
    // while status stays `waiting`; null means a live process is expected.
    // `lastViewedAt` records when the user last opened the conversation (and on
    // every turn sent), driving the idle timer (falls back to createdAt).
    hibernatedAt: timestamp("hibernated_at", { withTimezone: true }),
    lastViewedAt: timestamp("last_viewed_at", { withTimezone: true }),
  },
  // attempts_v / tasks_v derive status via per-attempt correlated subqueries on
  // conversations.attempt_id, several of them filtered by status (max_ended_at,
  // has_live_conv `status NOT IN ('gone','done')`, has_waiting `status='waiting'`).
  // The composite (attempt_id, status) serves both the bare attempt_id lookups
  // and the status-filtered ones; without it these are full seq scans of the
  // conversations table per attempt on every cascade.
  (t) => [index("conversations_attempt_id_status_idx").on(t.attemptId, t.status)],
);
