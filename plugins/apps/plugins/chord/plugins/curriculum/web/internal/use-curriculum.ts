import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  endpointQueryKey,
  getEndpointErrorMessage,
  useEndpoint,
  useEndpointMutation,
} from "@plugins/infra/plugins/endpoints/web";
import {
  useResource,
  type ResourceResult,
} from "@plugins/primitives/plugins/live-state/web";
import { showToast } from "@plugins/shell/plugins/toast/web";
import {
  chordCurriculumResource,
  nextCurriculumStepEndpoint,
  undoCurriculumStepEndpoint,
  unlockCurriculumStepEndpoint,
  type Curriculum,
  type NextStep,
  type NextStepAnswer,
} from "../../core";

// ── Reading and moving the ladder from the browser ───────────────────────────
//
// Three things a surface needs: where the learner stands, what the next step
// would be, and the two writes that take it or take it back.
//
// The standing is live (the server pushes it), the next step is a read the
// server has to work out, and both writes end by asking for the next step
// again — whether they succeeded or not. That re-ask is NOT the caller's job:
// it happens inside the write hooks, so a surface cannot forget it and show a
// step that has already been taken.

/** Where the learner stands. `pending` until the server's first value lands. */
export function useCurriculum(): ResourceResult<Curriculum> {
  return useResource(chordCurriculumResource);
}

/** What the next-step read says right now. */
export type NextStepRead =
  /** The server has not answered yet. */
  | { kind: "loading" }
  /** The read itself failed (the write hooks' conflicts are toasts, not this). */
  | { kind: "error"; message: string }
  /** The server's answer: a step on offer, the index still loading, or the ladder finished. */
  | { kind: "answer"; answer: NextStepAnswer };

/**
 * The step on offer. A read, even though the route is a POST: working it out
 * scans the loop windows, which is why it is an endpoint rather than a live
 * resource (see the plugin's CLAUDE.md).
 *
 * It is asked once and then only again when a step is taken or taken back.
 */
export function useNextStep(): { read: NextStepRead; refetch: () => void } {
  const query = useEndpoint(nextCurriculumStepEndpoint, {});
  const refetch = useRefetchNextStep();
  if (query.data !== undefined) {
    return { read: { kind: "answer", answer: query.data }, refetch };
  }
  if (query.error) {
    return {
      read: { kind: "error", message: getEndpointErrorMessage(query.error) },
      refetch,
    };
  }
  return { read: { kind: "loading" }, refetch };
}

/** One of the two writes: the call, and whether it is still out. */
export type StepWrite = { run: () => void; pending: boolean };

/**
 * Take the step the learner was shown — that step and no other. The server
 * works the next step out again and refuses when it differs (the index grew,
 * or another tab stepped first). That refusal is a toast saying so, never a
 * silent nothing, and either way the next step is read again.
 */
export function useUnlockStep(): {
  unlock: (step: NextStep) => void;
  pending: boolean;
} {
  const refetch = useRefetchNextStep();
  const mutation = useEndpointMutation(unlockCurriculumStepEndpoint, {
    onSuccess: ({ level }) => {
      showToast({ description: `Added — you are on level ${String(level)}.` });
      refetch();
    },
    onError: (err) => {
      showToast({
        title:
          err.status === 409
            ? "The next step has changed"
            : "The step could not be added",
        description: getEndpointErrorMessage(err),
        variant: "error",
      });
      refetch();
    },
  });
  return {
    unlock: (step) => mutation.mutate({ body: { expected: step } }),
    pending: mutation.isPending,
  };
}

/** Take the last step back. Refuses at level 1, where there is none. */
export function useUndoStep(): StepWrite {
  const refetch = useRefetchNextStep();
  const mutation = useEndpointMutation(undoCurriculumStepEndpoint, {
    onSuccess: refetch,
    onError: (err) => {
      showToast({
        title: "The step could not be taken back",
        description: getEndpointErrorMessage(err),
        variant: "error",
      });
      refetch();
    },
  });
  return { run: () => mutation.mutate({}), pending: mutation.isPending };
}

/**
 * Ask for the next step again. The standing (`chord.curriculum`) pushes itself,
 * but the next step is a plain read, so every write ends here.
 */
function useRefetchNextStep(): () => void {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: endpointQueryKey(nextCurriculumStepEndpoint, {}, undefined),
    });
  }, [queryClient]);
}
