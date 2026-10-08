import {
  type AnyPgColumn,
  index,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { deriveUpdatedAt } from "@plugins/database/plugins/derived-updated-at/server";
import { rankText } from "@plugins/primitives/plugins/rank/core";
import { parsedText } from "@plugins/database/plugins/sql-column/server";
import { SavedSymbolNameSchema } from "@plugins/ui/plugins/icons/plugins/saved-names/core";
import { StoredModelChoiceSchema } from "@plugins/conversations/plugins/model-provider/core";
import { idColumn } from "@plugins/ids/server";
import { agentIdKind, agentLaunchIdKind } from "../../core/id-kinds";

// Physical tables only. Leaf in the schema dependency graph (no cross-plugin
// imports). Views, Zod schemas, and types live in `./schema.ts`.

export const _agents = deriveUpdatedAt(
  pgTable(
    "agents",
    {
      id: idColumn(agentIdKind),
      parentId: text("parent_id").references((): AnyPgColumn => _agents.id, {
        onDelete: "cascade",
      }),
      name: text("name").notNull(),
      // NULL prompt → folder/category node (no launch button). Non-null →
      // launchable agent whose prompt is fed to the spawned conversation.
      prompt: text("prompt"),
      // A model choice: a family ("sonnet" — its newest version at launch) or a
      // pinned version. NULL = the default choice.
      model: parsedText("model", StoredModelChoiceSchema),
      // Avatar: a picked Material Symbols name (checked against the installed
      // sets on every read and write) + a colour key. Both null = the default
      // robot-arm/violet avatar.
      icon: parsedText("icon", SavedSymbolNameSchema),
      iconColor: text("icon_color"),
      rank: rankText("rank").notNull(),
      createdAt: timestamp("created_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
      updatedAt: timestamp("updated_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
    },
    (t) => [index("agents_parent_rank_idx").on(t.parentId, t.rank)],
  ),
  {
    touchedBy: {
      parentId: true,
      name: true,
      prompt: true,
      model: true,
      icon: true,
      iconColor: true,
      rank: true,
      id: false,
      createdAt: false,
    },
  },
);

export const _agent_launches = pgTable(
  "agent_launches",
  {
    id: idColumn(agentLaunchIdKind),
    agentId: text("agent_id")
      .notNull()
      .references(() => _agents.id, { onDelete: "cascade" }),
    // Soft link to tasks — the tasks plugin owns that table's lifecycle, and
    // we keep launches discoverable even if the target task is later deleted
    // by another flow.
    taskId: text("task_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [index("agent_launches_agent_id_idx").on(t.agentId)],
);
