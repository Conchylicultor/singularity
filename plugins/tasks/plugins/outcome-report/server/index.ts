import type { ServerPluginDefinition } from "@plugins/framework/plugins/server-core/core";
import { outcomeReportRowsServed } from "./internal/resource";
import {
  outcomeReportInstructions,
  submitOutcomeReportTool,
} from "./internal/mcp-tools";

export default {
  description:
    "Outcome reports for automated tasks: the submit_outcome_report MCP tool (visible only to conversations whose task an automation filed or launched) stores one report per task in tasks_ext_outcome_report — markdown body, the attempt's git-measured standing, an optional question with one-click answers — releases the task's automation slot, and rings the bell when a question waits. Serves the outcome-reports lookup collection.",
  contributions: [...outcomeReportRowsServed.declare],
  register: [submitOutcomeReportTool, outcomeReportInstructions],
} satisfies ServerPluginDefinition;
