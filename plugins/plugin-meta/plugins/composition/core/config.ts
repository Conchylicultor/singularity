import { defineConfig } from "@plugins/config_v2/core";
import { listField } from "@plugins/fields/plugins/list/plugins/config/core";
import { textField } from "@plugins/fields/plugins/text/plugins/config/core";
import { stringListField } from "@plugins/fields/plugins/string-list/plugins/config/core";

// The composition manifest registry, now plain editable data in config_v2 (no
// codegen, no barrels). Each item is a `CompositionManifest`
// (`{ name, entryPoints, selectedContributors }`, owned by `closure`) plus the
// list field's `id` / `rank` identity. Runtime-editable from the Studio
// compositions pane; `promotableToGit` lets the future git-promotion follow-up
// land an edited manifest set as the committed default.
//
// Seed `default`: the agent-manager anchor demo — a full flavor and a lean
// flavor that differ by exactly the self-improvement contributors, so the
// set-difference of their bundles is the self-improvement subtree. The ids are
// migrated verbatim from the former `apps/plugins/agent-manager/composition`
// barrel. Code defaults carry an EXPLICIT stable `id` + `rank` (the UI only
// auto-injects those on "Add"), so seeded rows are editable and ordered. The
// two rank strings are the first two fractional-index keys (`Rank.between(null,
// null)` = "a0", then `Rank.between("a0", null)` = "a1").
export const compositionsConfig = defineConfig({
  name: "compositions",
  promotableToGit: true,
  fields: {
    manifests: listField({
      label: "Compositions",
      itemFields: {
        name: textField({ label: "Name" }),
        entryPoints: stringListField({ label: "Entry points" }),
        selectedContributors: stringListField({ label: "Contributors" }),
      },
      default: [
        {
          id: "agent-manager",
          rank: "a0",
          name: "agent-manager",
          entryPoints: ["apps.agent-manager"],
          selectedContributors: [
            "tasks.attempt-view",
            "tasks.task-list.recent",
            "ui.theme-toggle",
            "improve.element-picker",
            "review",
            "reports.crash",
            "reports.launch-fix",
            "screenshot.draw-on-app",
          ],
        },
        {
          id: "agent-manager-lean",
          rank: "a1",
          name: "agent-manager-lean",
          entryPoints: ["apps.agent-manager"],
          selectedContributors: [
            "tasks.attempt-view",
            "tasks.task-list.recent",
            "ui.theme-toggle",
          ],
        },
      ],
    }),
  },
});
