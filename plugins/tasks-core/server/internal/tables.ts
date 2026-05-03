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
import { rankText } from "@server/db/types";

// Physical tables only. This file is a load-order leaf: it must NOT import
// from any other plugin's schema/tables file so that cross-plugin schemas can
// depend on it without forming a cycle. Views, Zod schemas, and types live in
// `./schema.ts`.
//
// These five tables form a single FK cluster and are co-located here to
// eliminate the cycle that existed when _conversations lived in the
// conversations plugin and imported _attempts from the tasks plugin.

export const _tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey(),
    parentId: text("parent_id").references((): AnyPgColumn => _tasks.id, {
      onDelete: "cascade",
    }),
    title: text("title").notNull(),
    description: text("description"),
    // "user" for UI-created tasks, a conversation id for agent-created ones.
    author: text("author"),
    droppedAt: timestamp("dropped_at", { withTimezone: true }),
    heldAt: timestamp("held_at", { withTimezone: true }),
    expanded: boolean("expanded").notNull().default(false),
    rank: rankText("rank").notNull(),
    // Set when the task is queued to auto-launch as soon as all its
    // dependencies are non-blocking (done or dropped). The new-child-task
    // popover writes this; the maybeLaunchTask job in the conversations
    // plugin reads it. Both columns are written/cleared together (either
    // both null or both set).
    autoStartAt: timestamp("auto_start_at", { withTimezone: true }),
    autoStartModel: text("auto_start_model").$type<"opus" | "sonnet">(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("tasks_parent_rank_idx").on(t.parentId, t.rank)],
);

export const _attempts = pgTable("attempts", {
  id: text("id").primaryKey(),
  taskId: text("task_id")
    .notNull()
    .references(() => _tasks.id, { onDelete: "cascade" }),
  worktreePath: text("worktree_path").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

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

// Conversation model, status, and kind are owned here (co-located with the
// table) and re-exported through conversations/server/api for backward compat.
type ConversationModel = "opus" | "sonnet";
type ConversationStatus = "starting" | "working" | "waiting" | "gone";
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
    model: text("model").$type<ConversationModel>().notNull().default("opus"),
    kind: text("kind").$type<ConversationKind>().notNull().default("user"),
    claudeSessionId: text("claude_session_id"),
    spawnedBy: text("spawned_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
  },
);
