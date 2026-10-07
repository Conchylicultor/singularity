import { enumField } from "@plugins/fields/plugins/enum/plugins/config/core";
import { intField } from "@plugins/fields/plugins/int/plugins/config/core";
import { stringListField } from "@plugins/fields/plugins/string-list/plugins/config/core";
import {
  defineAutomationConfig,
  labeledOptions,
} from "@plugins/tasks/plugins/automations/core";
import {
  REPORT_INVESTIGATIONS_PROMPT,
  REPORT_SEVERITIES,
  REPORT_SEVERITY_LABELS,
} from "./scope";

/** The automation's id: its config document's name and its job's suffix. */
export const REPORT_INVESTIGATIONS_ID = "report-investigations";

/**
 * The Report investigations automation's config: OFF by default; on, it runs
 * 10 min after a burst of reports settles, covers recurring errors (3+
 * occurrences, `report-storm` aside), and may push only an uncontroversial
 * fix. Stored as `config/tasks/automations/report-investigations.origin.jsonc`.
 */
export const reportInvestigationsConfig = defineAutomationConfig(
  REPORT_INVESTIGATIONS_ID,
  {
    enabled: false,
    push: "safe",
    trigger: "event",
    settleMinutes: 10,
    cadence: "day",
    at: "09:00",
    prompt: REPORT_INVESTIGATIONS_PROMPT,
  },
  {
    severity: enumField({
      label: "Severity",
      description:
        "Which reports qualify by their kind's severity: errors, errors and warnings, or everything.",
      options: labeledOptions(REPORT_SEVERITIES, REPORT_SEVERITY_LABELS),
      default: "error",
    }),
    minCount: intField({
      label: "At least (occurrences)",
      description:
        "A report qualifies once it has happened this many times; 1 = on its first occurrence.",
      min: 1,
      max: 1000,
      default: 3,
    }),
    excludedKinds: stringListField({
      label: "Excluded kinds",
      description: "Report kinds that never qualify.",
      default: ["report-storm"],
    }),
  },
);
