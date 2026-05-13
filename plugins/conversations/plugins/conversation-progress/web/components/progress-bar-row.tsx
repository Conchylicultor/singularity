import { SegmentedProgressBar } from "@plugins/ui/plugins/segmented-progress-bar/web";
import type { ConversationItemConv } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { PHASE_ORDER, PHASE_LABELS } from "@plugins/conversations/plugins/conversation-progress/shared/schemas";
import { useProgressFor } from "../internal/use-progress";

const STEPS = PHASE_ORDER.map((p) => ({ id: p, label: PHASE_LABELS[p] }));

export function ProgressBarRow({ conv }: { conv: ConversationItemConv }) {
  const progress = useProgressFor(conv.id);
  if (conv.kind === "agent") return null;
  if (!progress) return null;
  return (
    <SegmentedProgressBar steps={STEPS} activeStep={progress.phase} compact />
  );
}
