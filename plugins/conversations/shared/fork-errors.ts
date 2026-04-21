import { resourceDescriptor } from "@core/shared/resource";

export interface ForkError {
  id: string;
  attemptId: string;
  message: string;
}

export const forkErrorsResource = resourceDescriptor<ForkError | null>(
  "conversations.fork-errors",
);
