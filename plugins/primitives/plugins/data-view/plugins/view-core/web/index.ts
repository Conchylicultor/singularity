import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { buildInstanceFromRow } from "./internal/resolve-instances";
export type { ResolvedViewInstance } from "./internal/resolve-instances";
export { useViewsConfig } from "./internal/use-views-config";
export type { ViewsConfigHandle } from "./internal/use-views-config";
export { useViewModel } from "./internal/use-view-model";
export type { ViewModelCore, ViewActionsCore } from "./internal/use-view-model";
export { useViewVariants } from "./internal/use-view-variants";
export { buildViewDescriptors } from "./internal/build-descriptors";
export { buildViewConfigContributions } from "./internal/config-registrations";
export { EditableViewSwitcher } from "./components/editable-view-switcher";
export { ViewSettingsPopover } from "./components/view-settings-popover";

export default {
  description:
    "Type-agnostic named-view-instance engine: instance model + resolver, config-descriptor machinery, debounced write-back, and the editable view-switcher chrome.",
  // Headless engine — registers no contributions of its own. Consumers register
  // their own per-id `ConfigV2.WebRegister` via `buildViewConfigContributions`.
  contributions: [],
} satisfies PluginDefinition;
