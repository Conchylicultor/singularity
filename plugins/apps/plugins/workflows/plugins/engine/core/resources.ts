import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/core";
import { WorkflowDefinitionSchema, WorkflowExecutionSchema } from "./schemas";

export const workflowDefinitionsDescriptor = resourceDescriptor(
  "workflow-definitions",
  z.array(WorkflowDefinitionSchema),
  [],
);

export const workflowExecutionsDescriptor = resourceDescriptor(
  "workflow-executions",
  z.array(WorkflowExecutionSchema),
  [],
);
