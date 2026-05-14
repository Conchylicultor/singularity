import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { Spinner, type SpinnerProps } from "./internal/spinner";

export default {
  id: "spinner",
  name: "Spinner",
  description:
    "Spinning refresh icon for loading states. Renders MdRefresh with animate-spin; defaults to always spinning, accepts spinning={false} to pause.",
  contributions: [],
} satisfies PluginDefinition;
