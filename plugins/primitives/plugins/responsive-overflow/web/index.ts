import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  ResponsiveOverflow,
  useResponsiveOverflow,
} from "./internal/responsive-overflow";
export type {
  ResponsiveOverflowProps,
  UseResponsiveOverflowOptions,
  UseResponsiveOverflowHandle,
} from "./internal/responsive-overflow";

export default {
  name: "Responsive Overflow",
  description:
    "Progressively hides children that don't fit the container width. Exposes ResponsiveOverflow component and useResponsiveOverflow hook.",
  contributions: [],
} satisfies PluginDefinition;
