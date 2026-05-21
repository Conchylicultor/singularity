import { SegmentedProgressBar } from "@plugins/ui/plugins/segmented-progress-bar/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { PHASE_ORDER, PHASE_LABELS } from "../../shared/schemas";
import { useProgressFor } from "../internal/use-progress";

const STEPS = PHASE_ORDER.map((p) => ({ id: p, label: PHASE_LABELS[p] }));

export function ProgressBarToolbar() {
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  const progress = useProgressFor(convId);
  if (!conversation) return null;
  if (conversation.kind === "agent") return null;
  if (!progress) return null;
  return (
    <span className="inline-flex items-center">
      <SegmentedProgressBar steps={STEPS} activeStep={progress.phase} />
    </span>
  );
}
