import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useEndpointMutation } from "@plugins/infra/plugins/endpoints/web";
import { toast } from "@plugins/shell/plugins/notifications/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { jsonlEventsResource } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/core";
import { JsonlViewer } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
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
  const m = useEndpointMutation(flushQuestion, {
    onError: (err) =>
      toast({
        type: "conversation",
        title: "Flush failed",
        description: err.message,
        variant: "error",
      }),
  });

  if (eventsResult.pending) return null;
  if (findAwaitingAuqEvent(eventsResult.data) != null) return null;

  return (
    <Text as="div" variant="caption" className="text-warning/70">
      <Stack direction="row" gap="sm" align="center">
        <span>Content pending in terminal — waiting for your input</span>
        <Button
          loading={m.isPending}
          onClick={() => m.mutate({ params: { id: conversationId } })}
        >
          Answer here
        </Button>
        <JsonlViewer.PendingPromptAction.Render />
      </Stack>
    </Text>
  );
}
