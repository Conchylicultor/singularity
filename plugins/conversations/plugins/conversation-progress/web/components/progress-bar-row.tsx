import type { ConversationItemConv } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { useProgressFor } from "../internal/use-progress";
import { ProgressDots } from "./progress-dots";

export function ProgressBarRow({ conv }: { conv: ConversationItemConv }) {
  const progress = useProgressFor(conv.id);
  if (conv.kind === "agent") return null;
  if (!progress) return null;
  return <ProgressDots phase={progress.phase} compact />;
}
