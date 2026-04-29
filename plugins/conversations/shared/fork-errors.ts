import { z } from "zod";
import { resourceDescriptor } from "@plugins/primitives/plugins/live-state/shared";

export const ForkErrorSchema = z.object({
  id: z.string(),
  attemptId: z.string(),
  message: z.string(),
});

export interface ForkError {
  id: string;
  attemptId: string;
  message: string;
}

export const forkErrorsResource = resourceDescriptor<ForkError | null>(
  "conversations.fork-errors",
  ForkErrorSchema.nullable(),
);
