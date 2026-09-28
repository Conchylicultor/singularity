import { useLive } from "@plugins/network/plugins/live/web";
import { jsonlEvents } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/core";
import { useWorkflowTrace } from "./use-workflow-trace";
import type { TracedGraph, TracedNode, TraceStatus } from "./trace-types";

interface WorkflowInput {
  script?: string;
  args?: unknown;
}

export type WorkflowNodeState =
  | { pending: true }
  // No conversation pane above this one: there is no transcript to read
  // (skipped), a settled answer — never a spinner.
  | { pending: false; conversation: false }
  | {
      pending: false;
      conversation: true;
      graph: TracedGraph | null;
      status: TraceStatus;
      node: TracedNode | undefined;
    };

/**
 * One step of a Workflow tool call: the conversation's transcript (the global
 * `jsonlEvents` value) → the call's script → its traced DAG → the node.
 *
 * Reads only its arguments and global resources, so it serves both the pane
 * body and the pane's `title.text` (which runs outside the app's providers).
 * `convId` is `undefined` when no conversation pane sits above this one.
 */
export function useWorkflowNode(
  convId: string | undefined,
  toolUseId: string,
  nodeId: string,
): WorkflowNodeState {
  const eventsResult = useLive(
    jsonlEvents,
    convId === undefined ? null : { id: convId },
  );
  // The trace hook runs unconditionally, so the script is read here without an
  // early return; a pending transcript has no script yet (and is reported as
  // pending below, never as an empty trace).
  let input: WorkflowInput | null = null;
  if (!eventsResult.pending) {
    const event = eventsResult.data.find(
      (e) => e.kind === "tool-call" && e.toolUseId === toolUseId,
    );
    if (event?.kind === "tool-call") input = event.input as WorkflowInput;
  }

  const { graph, status } = useWorkflowTrace(input?.script ?? "", input?.args);

  if (convId === undefined) return { pending: false, conversation: false };
  if (eventsResult.pending) return { pending: true };
  const node = graph?.nodes.find((n) => n.id === nodeId);
  return { pending: false, conversation: true, graph, status, node };
}

/**
 * The step's label, for the pane's `title.text`. The conversation id is the
 * ANCESTOR conversation pane's param, which the title hook receives in its
 * chained params.
 */
export function useWorkflowNodeTitle({
  convId,
  toolUseId,
  nodeId,
}: {
  convId?: string;
  toolUseId: string;
  nodeId: string;
}): string | undefined {
  const state = useWorkflowNode(convId, toolUseId, nodeId);
  return state.pending || !state.conversation ? undefined : state.node?.label;
}
