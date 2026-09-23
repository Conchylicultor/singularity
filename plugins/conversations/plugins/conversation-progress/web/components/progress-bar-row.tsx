import { SegmentedProgressBar } from "@plugins/ui/plugins/segmented-progress-bar/web";
import type { ConversationItemConv } from "@plugins/conversations/plugins/conversation-ui/plugins/item/web";
import { PHASE_ORDER, PHASE_LABELS } from "../../shared/schemas";
import { useProgressFor } from "../internal/use-progress";

const STEPS = PHASE_ORDER.map((p) => ({ id: p, label: PHASE_LABELS[p] }));

export function ProgressBarRow({ conv }: { conv: ConversationItemConv }) {
  const result = useProgressFor(conv.id);
  if (conv.kind === "agent") return null;
  // Nothing while loading, nothing when no progress is classified yet.
  if (result.pending) return null;
  const progress = result.data;
  if (!progress) return null;
  return (
    <SegmentedProgressBar steps={STEPS} activeStep={progress.phase} compact />
  );
}
