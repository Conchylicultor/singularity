import { useMemo } from "react";
import { formatTokenCount } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import {
  StatBadge,
  useTranscriptRead,
  type StatTone,
} from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/transcript-stats/web";
import { readBudget } from "../budget";

// A budget with most of itself still in it is not news, so the stat stays a
// plain grey reading. Below LOW it starts stating the share outright, and below
// ATTENTION / ALERT it takes on ink — the reading gets louder exactly as it
// starts to matter, and never before.
const LOW_SHARE = 0.5;
const ATTENTION_SHARE = 0.25;
const ALERT_SHARE = 0.1;

export function TokenBudgetStat() {
  const { events } = useTranscriptRead();
  const status = useMemo(() => readBudget(events), [events]);
  // The harness has not reported a budget in this stretch of the transcript.
  if (!status) return null;

  const { remaining, budget, share, spent } = status;
  const percent = Math.round(share * 100);
  const tone: StatTone =
    share <= ALERT_SHARE
      ? "alert"
      : share <= ATTENTION_SHARE
        ? "attention"
        : "muted";

  const title = [
    `${remaining.toLocaleString()} of ${budget.toLocaleString()} tokens left (${percent}%)`,
    spent > 0 ? `${spent.toLocaleString()} used so far` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <StatBadge tone={tone} title={title}>
      {formatTokenCount(remaining)} left
      {share <= LOW_SHARE && ` (${percent}%)`}
    </StatBadge>
  );
}
