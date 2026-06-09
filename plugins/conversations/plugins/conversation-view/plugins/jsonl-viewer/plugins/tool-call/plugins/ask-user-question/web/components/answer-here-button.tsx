import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { toast } from "@plugins/notifications/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { jsonlEventsResource } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/core";
import { Button } from "@/components/ui/button";
import { flushQuestion } from "../../shared";
import { findAwaitingAuqEvent } from "./awaiting";

export function AnswerHereButton({
  conversationId,
}: {
  conversationId: string;
  waitingFor: string;
}) {
  // When an AskUserQuestion is already flushed to the JSONL and awaiting an
  // answer, its card renders its own inline answer form — defer to it so the
  // two surfaces never double up. We only show this generic indicator when the
  // tool_use has NOT yet hit the transcript (still blocked in the terminal).
  const eventsResult = useResource(jsonlEventsResource, { id: conversationId });
  const events = eventsResult.pending ? undefined : eventsResult.data;
  const m = useEndpointMutation(flushQuestion, {
    onError: (err) =>
      toast({
        type: "conversation",
        title: "Flush failed",
        description: err.message,
        variant: "error",
      }),
  });

  if (findAwaitingAuqEvent(events) != null) return null;

  return (
    <div className="flex items-center gap-2 text-xs text-warning/70">
      <span>Content pending in terminal — waiting for your input</span>
      <Button
        size="sm"
        disabled={m.isPending}
        onClick={() => m.mutate({ params: { id: conversationId } })}
      >
        {m.isPending ? "Opening…" : "Answer here"}
      </Button>
    </div>
  );
}
