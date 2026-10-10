import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Conversation } from "@plugins/conversations/plugins/conversation-view/web";
import { Automations } from "@plugins/tasks/plugins/automations/web";
import {
  OutcomeReportCard,
  OutcomeReportDetail,
} from "./components/outcome-report-card";

export { OutcomeReportDetail } from "./components/outcome-report-card";

export default {
  description:
    "The outcome report an automated task's agent submitted: a card above the prompt input of the conversation that wrote it (markdown body, pushed / branch-waiting / no-changes standing, and its question as one-click answers sent as the next turn), and OutcomeReportDetail — the same report read-only, shown in an expanded row of an automation's History (Automations.TaskDetail).",
  contributions: [
    Conversation.AbovePromptInput({
      id: "outcome-report",
      component: OutcomeReportCard,
    }),
    // An expanded row of an automation's History shows its task's report.
    Automations.TaskDetail({
      id: "outcome-report",
      component: OutcomeReportDetail,
    }),
  ],
} satisfies PluginDefinition;
