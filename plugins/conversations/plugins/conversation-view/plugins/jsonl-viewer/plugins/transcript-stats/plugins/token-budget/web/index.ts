import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { JsonlViewer } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { TranscriptStats } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/transcript-stats/web";
import { TokenBudgetStat } from "./components/token-budget-stat";
import { isTotalTokensReminder } from "./budget";

export default {
  collapsed: true,
  description:
    "The session's token budget as a transcript stat: how much of the harness's total_tokens budget is left as of the reading position, louder as it drains. Owns both halves of the move — the stat, and the filter that takes the harness's repeated reminder rows out of the transcript flow they were cluttering.",
  contributions: [
    TranscriptStats.Item({ id: "token-budget", component: TokenBudgetStat }),
    JsonlViewer.EventFilter({
      id: "total-tokens-reminder",
      hide: isTotalTokensReminder,
    }),
  ],
} satisfies PluginDefinition;
