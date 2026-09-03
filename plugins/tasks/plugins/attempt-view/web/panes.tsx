import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { defineRoute } from "@plugins/primitives/plugins/pane/core";
import { agentManagerApp } from "@plugins/apps/plugins/agent-manager/plugins/shell/core";
import { attemptsResource } from "@plugins/tasks/plugins/tasks-core/core";
import { AttemptPane } from "./components/attempt-pane";

function useResolveAttempt({ attemptId }: { attemptId: string }) {
  const result = useResource(attemptsResource);
  if (result.pending) return { pending: true, found: false };
  return { pending: false, found: result.data.some((a) => a.id === attemptId) };
}

const attemptRoute = defineRoute({
  id: "attempt",
  segment: "a/:attemptId",
});

export const attemptPane = Pane.define({
  route: attemptRoute,
  app: agentManagerApp,
  component: AttemptPane,
  width: 320,
  resolve: useResolveAttempt,
});
