import { text } from "drizzle-orm/pg-core";
import { defineTriggerEvent } from "@plugins/infra/plugins/events/server";

export interface UserInputSubmittedPayload {
  executionId: string;
  stepId: string;
  data: Record<string, unknown>;
  [key: string]: unknown;
}

export const { event: userInputSubmitted, table: _userInputSubmittedTriggers } =
  defineTriggerEvent<UserInputSubmittedPayload>({
    name: "workflows.userInputSubmitted",
    filters: {
      executionId: text("execution_id"),
      stepId: text("step_id"),
    },
  });
