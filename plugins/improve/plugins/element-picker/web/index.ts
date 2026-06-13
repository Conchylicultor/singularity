import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ActiveData } from "@plugins/active-data/web";
import { ActionBar } from "@plugins/shell/plugins/action-bar/web";
import { TaskDraftFormSlots } from "@plugins/tasks/plugins/task-draft-form/web";
import { UI_CONTEXT_RE } from "../core";
import { ElementPickerButton } from "./components/element-picker-button";
import { TaskDraftPickerButton } from "./components/task-draft-picker-button";
import { UiContextTag } from "./components/ui-context-tag";
import "./internal/marker-middleware";

export default {
  description:
    "Chrome-inspector-style 'pick a UI element' toolbar button. Overlays the live app to hover/click any element, captures its plugin/slot/pane/URL metadata, and hands a readable <ui-context/> tag to the Improve popover as a rich inline chip.",
  contributions: [
    ActionBar.Item({ id: "element-picker", component: ElementPickerButton }),
    TaskDraftFormSlots.Action({
      id: "element-picker",
      component: TaskDraftPickerButton,
    }),
    // The chip renders the same everywhere via the active-data inline registry:
    // composing (editor node bridge) and on display (markdown / user-text linkify).
    ActiveData.Tag({ display: "inline", pattern: UI_CONTEXT_RE, component: UiContextTag }),
  ],
} satisfies PluginDefinition;
