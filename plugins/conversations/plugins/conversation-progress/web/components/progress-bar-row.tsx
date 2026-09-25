import { SegmentedProgressBar } from "@plugins/ui/plugins/segmented-progress-bar/web";
import type { ConversationItemConv } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { PHASE_STEPS, PROGRESS_SUMMARY } from "../../shared/schemas";
import { useProgressFor } from "../internal/use-progress";

export function ProgressBarRow({ conv }: { conv: ConversationItemConv }) {
  const result = useProgressFor(conv.id);
  if (conv.kind === "agent") return null;
  // Nothing while loading, nothing when no progress is classified yet.
  if (result.pending) return null;
  const progress = result.data;
  if (!progress) return null;
  return (
    <SegmentedProgressBar
      steps={PHASE_STEPS}
      activeStep={progress.phase}
      summary={PROGRESS_SUMMARY}
      compact
    />
  );
}
