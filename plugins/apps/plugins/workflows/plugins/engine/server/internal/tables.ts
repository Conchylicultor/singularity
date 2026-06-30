import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { DefinitionStep, ExecutionStatus, ExecutionStepStatus } from "../../core";

export const _workflowDefinitions = pgTable("workflow_definitions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  steps: jsonb("steps").$type<Record<string, DefinitionStep>>().notNull().default({}),
  entryStepId: text("entry_step_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const _workflowExecutions = pgTable("workflow_executions", {
  id: text("id").primaryKey(),
  definitionId: text("definition_id")
    .notNull()
    .references(() => _workflowDefinitions.id, { onDelete: "cascade" }),
  status: text("status").$type<ExecutionStatus>().notNull().default("pending"),
  currentStepId: text("current_step_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
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
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    next: text("next"),
    nextStepMapping: jsonb("next_step_mapping").$type<Record<string, string> | null>(),
    status: text("status").$type<ExecutionStepStatus>().notNull().default("pending"),
    input: jsonb("input"),
    output: jsonb("output"),
    error: text("error"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (t) => [index("wf_exec_steps_exec_idx").on(t.executionId, t.executionOrder)],
);
