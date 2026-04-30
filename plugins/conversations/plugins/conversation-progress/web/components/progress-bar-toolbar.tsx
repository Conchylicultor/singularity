import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useProgressFor } from "../internal/use-progress";
import { ProgressDots } from "./progress-dots";

export function ProgressBarToolbar() {
  const { conversation } = conversationPane.useData();
  const progress = useProgressFor(conversation.id);
  if (conversation.kind === "agent") return null;
  if (!progress) return null;
  return (
    <span className="inline-flex items-center">
      <ProgressDots phase={progress.phase} />
    </span>
  );
}
