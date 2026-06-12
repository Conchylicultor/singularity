import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ActionBar } from "@plugins/shell/plugins/action-bar/web";
import { ElementPickerButton } from "./components/element-picker-button";
import "./internal/register-node";
import "./internal/marker-middleware";

export default {
  description:
    "Chrome-inspector-style 'pick a UI element' toolbar button. Overlays the live app to hover/click any element, captures its plugin/slot/pane/URL metadata, and hands a readable <ui-context/> tag to the Improve popover as a rich inline chip.",
  contributions: [
    ActionBar.Item({ id: "element-picker", component: ElementPickerButton }),
  ],
} satisfies PluginDefinition;
