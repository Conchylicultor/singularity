import {
  type AnyPgColumn,
  boolean,
  index,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { rankText } from "@server/db/types";

// Physical tables only. Leaf in the schema dependency graph (no cross-plugin
// imports). Views, Zod schemas, and types live in `./schema.ts`.

export const _agents = pgTable(
  "agents",
  {
    id: text("id").primaryKey(),
    parentId: text("parent_id").references((): AnyPgColumn => _agents.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    description: text("description"),
    // NULL prompt → folder/category node (no launch button). Non-null →
    // launchable agent whose prompt is fed to the spawned conversation.
    prompt: text("prompt"),
    model: text("model"),
    // Avatar key (icon + color) into the avatar primitive's registry. Both
    // null = use the default robot/violet avatar.
    icon: text("icon"),
    iconColor: text("icon_color"),
    expanded: boolean("expanded").notNull().default(false),
    rank: rankText("rank").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("agents_parent_rank_idx").on(t.parentId, t.rank)],
);

export const _agent_launches = pgTable(
  "agent_launches",
  {
    id: text("id").primaryKey(),
    agentId: text("agent_id")
      .notNull()
      .references(() => _agents.id, { onDelete: "cascade" }),
    // Soft link to tasks — the tasks plugin owns that table's lifecycle, and
    // we keep launches discoverable even if the target task is later deleted
    // by another flow.
    taskId: text("task_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("agent_launches_agent_id_idx").on(t.agentId)],
);
