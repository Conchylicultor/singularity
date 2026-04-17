import { defineResource } from "../../../../server/src/resources";
import type { ForkError } from "../../shared/fork-errors";

let latest: ForkError | null = null;

export const forkErrorsResource = defineResource<ForkError | null>({
  key: "conversations.fork-errors",
  mode: "push",
  loader: () => latest,
});

export function reportForkError(attemptId: string, err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  latest = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    attemptId,
    message,
  };
  forkErrorsResource.notify();
}
