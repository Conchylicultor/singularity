import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import {
  Automations,
  automationConfigContributions,
} from "@plugins/tasks/plugins/automations/web";
import {
  reportInvestigationsConfig,
  REPORT_INVESTIGATIONS_ID,
} from "../shared/config";
import { ReportScopeSection } from "./components/report-scope-section";

export default {
  description:
    "The Report investigations automation in the Automations pane: registers its config (trigger, push policy, model, prompt, scope) and contributes its Which reports section — severity, recurrence threshold, kind by kind with the uninvestigated reports that match right now.",
  contributions: [
    ...automationConfigContributions(reportInvestigationsConfig),
    Automations.Section({
      id: "report-scope",
      automationId: REPORT_INVESTIGATIONS_ID,
      component: ReportScopeSection,
    }),
  ],
} satisfies PluginDefinition;
