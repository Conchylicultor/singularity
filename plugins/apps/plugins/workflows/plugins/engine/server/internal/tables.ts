import { z } from "zod";
import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import {
  parsedJson,
  parsedText,
} from "@plugins/database/plugins/sql-column/server";
import {
  DefinitionStepSchema,
  ExecutionStatusSchema,
  ExecutionStepStatusSchema,
} from "../../core";

export const _workflowDefinitions = pgTable("workflow_definitions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  // The definition's steps, keyed by step id. `z.record` over the step ids (an
  // open set) with each VALUE the closed `DefinitionStepSchema` — the same
  // declaration `WorkflowDefinitionSchema.steps` uses, so the column and the
  // wire contract read one schema and cannot drift.
  steps: parsedJson("steps", z.record(z.string(), DefinitionStepSchema))
    .notNull()
    .default({}),
  entryStepId: text("entry_step_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const _workflowExecutions = pgTable("workflow_executions", {
  id: text("id").primaryKey(),
  definitionId: text("definition_id")
    .notNull()
    .references(() => _workflowDefinitions.id, { onDelete: "cascade" }),
  status: parsedText("status", ExecutionStatusSchema)
    .notNull()
    .default("pending"),
  currentStepId: text("current_step_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const _workflowExecutionSteps = pgTable(
  "workflow_execution_steps",
  {
    id: text("id").primaryKey(),
    executionId: text("execution_id")
      .notNull()
      .references(() => _workflowExecutions.id, { onDelete: "cascade" }),
    definitionStepId: text("definition_step_id").notNull(),
    executionOrder: integer("execution_order").notNull(),
    stepPluginId: text("step_plugin_id").notNull(),
    label: text("label").notNull(),
    // The step's own config, whose shape belongs to its step-type plugin — one
    // column across every step type, so `z.record` is the only honest schema
    // and it keeps every key the plugin wrote.
    config: parsedJson("config", z.record(z.string(), z.unknown()))
      .notNull()
      .default({}),
    next: text("next"),
    // branch key → next step id. Nullable is drizzle's (no `.notNull()`), so the
    // decoder is handed the inner schema and never sees a `null`.
    nextStepMapping: parsedJson(
      "next_step_mapping",
      z.record(z.string(), z.string()),
    ),
    status: parsedText("status", ExecutionStepStatusSchema)
      .notNull()
      .default("pending"),
    // Whatever the previous step emitted, and whatever this one emitted — open
    // by design (any step type's output can be the next one's input), so these
    // declare `unknown` and mean it. Nothing for a decoder to verify.
    input: jsonb("input"),
    output: jsonb("output"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (t) => [index("wf_exec_steps_exec_idx").on(t.executionId, t.executionOrder)],
);
