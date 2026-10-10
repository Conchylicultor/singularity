import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import {
  Automations,
  automationConfigContributions,
} from "@plugins/tasks/plugins/automations/web";
import {
  sidequestAutopilotConfig,
  SIDEQUEST_AUTOPILOT_ID,
} from "../shared/config";
import { RunUntilSection } from "./components/run-until-section";

export default {
  description:
    "The Sidequest autopilot in the Automations pane: registers its config (enabled, at once, push policy, model, prompt) and contributes its Run until section — until you turn it off, or until a date and time after which it turns itself off.",
  contributions: [
    ...automationConfigContributions(sidequestAutopilotConfig),
    Automations.Section({
      id: "run-until",
      automationId: SIDEQUEST_AUTOPILOT_ID,
      component: RunUntilSection,
    }),
  ],
} satisfies PluginDefinition;
