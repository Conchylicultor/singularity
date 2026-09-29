import { useResource } from "@plugins/primitives/plugins/live-state/web";
import {
  Pane,
  defineRoute,
  resolveFrom,
  type ResolveResult,
} from "@plugins/primitives/plugins/pane/web";
import { agentManagerApp } from "@plugins/apps/plugins/agent-manager/plugins/shell/core";
import { attemptsResource } from "@plugins/tasks/plugins/tasks-core/core";
import { AttemptPane, AttemptsTitle } from "./components/attempt-pane";

function useResolveAttempt({
  attemptId,
}: {
  attemptId: string;
}): ResolveResult {
  return resolveFrom(useResource(attemptsResource), (attempts) =>
    attempts.some((a) => a.id === attemptId),
  );
}

export const attemptPane = Pane.define({
  route: defineRoute({
    id: "attempt",
    segment: "a/:attemptId",
  }),
  app: agentManagerApp,
  component: AttemptPane,
  width: 320,
  resolve: useResolveAttempt,
  // The header adds the task's conversation count beside the word.
  title: { text: "Attempts", component: AttemptsTitle },
});
