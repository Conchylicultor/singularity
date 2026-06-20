import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { attemptsResource } from "@plugins/tasks/plugins/tasks-core/core";
import { AttemptPane } from "./components/attempt-pane";

function useResolveAttempt({ attemptId }: { attemptId: string }) {
  const result = useResource(attemptsResource);
  if (result.pending) return { pending: true, found: false };
  return { pending: false, found: result.data.some((a) => a.id === attemptId) };
}

export const attemptPane = Pane.define({
  id: "attempt",
  segment: "a/:attemptId",
  component: AttemptPane,
  width: 320,
  resolve: useResolveAttempt,
});
