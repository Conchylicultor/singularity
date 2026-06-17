import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { MdReplay } from "react-icons/md";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversation } from "@plugins/conversations/web";
import { toast } from "@plugins/shell/plugins/notifications/web";
import { useEndpointMutation, getEndpointErrorMessage } from "@plugins/infra/plugins/endpoints/web";
import { resumeConversationEndpoint } from "@plugins/conversations/plugins/conversation-view/plugins/resume/core";

export function ResumeButton({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  const live = useConversation(conversation.id) ?? conversation;
  const resume = useEndpointMutation(resumeConversationEndpoint, {
    onSuccess: () =>
      toast({
        type: "conversation",
        title: "Resuming conversation",
        description: "Reconnecting the agent session…",
        variant: "success",
      }),
    onError: (err) =>
      toast({
        type: "conversation",
        title: "Resume failed",
        description: getEndpointErrorMessage(err),
        variant: "error",
      }),
  });

  const isNotRunning = live.status === "gone" || live.status === "done";
  const hasSession = !!live.claudeSessionId;
  const canResume = isNotRunning && hasSession;

  const tooltip = !isNotRunning
    ? "Resume is available once the session has exited"
    : !hasSession
      ? "No saved Claude session to resume"
      : "Resume conversation (claude --resume)";

  function onClick() {
    if (resume.isPending || !canResume) return;
    resume.mutate({ params: { id: conversation.id } });
  }

  return (
    <Button
      variant="outline"
      size="icon-sm"
      title={resume.isPending ? "Resuming…" : tooltip}
      aria-label="Resume"
      loading={resume.isPending}
      disabled={!canResume}
      onClick={onClick}
    >
      <MdReplay className="size-3.5" />
    </Button>
  );
}
