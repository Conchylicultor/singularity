import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { DynamicEnum } from "@plugins/fields/plugins/dynamic-enum/plugins/config/web";
import { tabBarConfig } from "../core";
import { TabBar } from "./slots";

export { Tab } from "./components/tab";
export { TabCloseButton } from "./components/tab-close-button";
export { TabBar as TabBarSlots } from "./slots";
export type { TabVariantContribution } from "./slots";
export type { TabProps } from "../core";

export default {
  description: "Themable tab bar: chip / underline / connected variants.",
  contributions: [
    ConfigV2.WebRegister({ descriptor: tabBarConfig }),
    DynamicEnum.Options({
      field: tabBarConfig.fields.variant,
      useOptions: () =>
        TabBar.Variant.useContributions().map((v) => ({
          value: v.id,
          label: v.label,
        })),
    }),
  ],
} satisfies PluginDefinition;
