import { symbol } from "@plugins/ui/plugins/icons/core";
import { defineAutomation } from "@plugins/tasks/plugins/automations/server";
import { listSidequestTasks } from "@plugins/tasks/plugins/task-track/server";
import {
  sidequestAutopilotConfig,
  SIDEQUEST_AUTOPILOT_ID,
} from "../../shared/config";
import { sidequestCandidates } from "./candidates";
import { stopIfPastRunUntil } from "./run-until";

// How many ready sidequests one run reads. The registry skips the few already
// launched or armed, then fills at most `concurrency` slots from the rest.
const CANDIDATE_WINDOW = 50;

/**
 * Sidequest autopilot: works through the sidequest backlog in the background,
 * a few agents at a time. Candidates are the sidequests ready to start — no
 * attempt yet, not held, dropped or blocked (derived status `new`) — oldest
 * first. Each agent gets the autopilot prompt (never ask, check obsolescence
 * first, stay in scope, report with `submit_outcome_report`), and its slot
 * frees when it reports or its task settles. Off by default.
 */
export const sidequestAutopilotAutomation = defineAutomation({
  kind: "launch",
  id: SIDEQUEST_AUTOPILOT_ID,
  label: "Sidequest autopilot",
  icon: symbol("rocket-launch"),
  description:
    "Works through the sidequest backlog on its own: starts agents on ready sidequests, oldest first, a few at a time, and each leaves you a report.",
  config: sidequestAutopilotConfig,
  triggers: {
    kinds: ["event"],
    eventLabel: "When a task becomes ready to start",
  },
  inProcess:
    "One indexed read of at most 50 ready sidequests, then at most `concurrency` (≤ 8) origin-row inserts and marker arms — bounded by the window and the slots; a restart leaves the tasks for the next run.",
  promptVariables: [
    { name: "taskId", description: "The sidequest's task id" },
    { name: "title", description: "The sidequest's title" },
    {
      name: "description",
      description: "The sidequest's description (or a note that it has none)",
    },
  ],
  candidates: async () => {
    if (await stopIfPastRunUntil()) return [];
    return sidequestCandidates(
      await listSidequestTasks({ statuses: ["new"], limit: CANDIDATE_WINDOW }),
    );
  },
});
