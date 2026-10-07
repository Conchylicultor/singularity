import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { DynamicEnum } from "@plugins/fields/plugins/dynamic-enum/plugins/config/web";
import { useModelChoiceOptions } from "@plugins/conversations/plugins/model-provider/web";
import { Pane } from "@plugins/primitives/plugins/pane/web";
import { opensPane } from "@plugins/primitives/plugins/app-shell/web";
import { Shell } from "@plugins/shell/web";
import { Tasks } from "@plugins/tasks/plugins/task-list/web";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { automationsConfig } from "../shared/config";
import { automationDetailPane, automationsPane } from "./panes";
import { OriginField } from "./components/origin-field";

export default {
  description:
    "Automations in the agent manager: the Automations sidebar entry and list (a DataView over the catalog — schedule in words, next run, on/off, open task), the detail pane (Run now through Background activity, the Behavior settings — enabled, push when checks pass, model — the included sources, and the History of the tasks it filed), the `origin` Automation field in every task DataView, and the per-automation settings registered for Settings → Config.",
  contributions: [
    ConfigV2.WebRegister({ descriptor: automationsConfig }),
    // An automation's model is picked from the live model catalog.
    DynamicEnum.Options({
      field: automationsConfig.fields.settings.itemFields.model,
      useOptions: useModelChoiceOptions,
    }),
    Pane.Register({ pane: automationsPane }),
    Pane.Register({ pane: automationDetailPane }),
    Shell.Sidebar({
      id: "automations",
      title: "Automations",
      icon: symbol("auto-mode"),
      opens: opensPane(automationsPane, {}),
    }),
    Tasks.Fields({ id: "origin", section: null, component: OriginField }),
  ],
  slots: {
    automations: automationsPane,
    "automation-detail": automationDetailPane,
  },
} satisfies PluginDefinition;
