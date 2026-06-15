import { asPluginId } from "@plugins/framework/plugins/plugin-id/core";
import type { CompositionManifest } from "@plugins/plugin-meta/plugins/closure/core";

// Seed compositions for the agent-manager app — the vision's anchor demo.
//
// Conservative opt-IN model: nothing soft is bundled by default, so a working
// flavor explicitly *selects* the contributors it wants. `agent-manager-lean`
// and `agent-manager` differ by exactly the self-improvement contributors, so
// the set-difference of their bundles is the self-improvement subtree — the
// "with vs without self-improvement" projection, expressible today with zero
// capability refactoring.
//
// Every id below is drawn from the live `available` frontier of the entry; the
// `composition-closure` check rejects ids that don't resolve, aren't genuine
// soft options, or are redundant.

const ENTRY = asPluginId("apps.agent-manager");

// Non-self-improvement contributors that make the app usable — present in BOTH
// flavors, so they stay out of the diff.
const CORE_CONTRIBUTORS = [
  asPluginId("tasks.attempt-view"),
  asPluginId("tasks.task-list.recent"),
  asPluginId("ui.theme-toggle"),
];

// The self-improvement machinery — present only in the full flavor.
const SELF_IMPROVEMENT = [
  asPluginId("improve.element-picker"),
  asPluginId("review"),
  asPluginId("reports.crash"),
  asPluginId("reports.launch-fix"),
  asPluginId("screenshot.draw-on-app"),
];

const compositions: CompositionManifest[] = [
  {
    name: "agent-manager",
    entryPoints: [ENTRY],
    selectedContributors: [...CORE_CONTRIBUTORS, ...SELF_IMPROVEMENT],
  },
  {
    name: "agent-manager-lean",
    entryPoints: [ENTRY],
    selectedContributors: [...CORE_CONTRIBUTORS],
  },
];

export default compositions;
