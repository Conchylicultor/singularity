import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { Loading } from "./internal/loading";
export type { LoadingProps, LoadingVariant } from "./internal/loading";

export default {
  description:
    "Single entry point for the loading state: text / spinner / skeleton-rows / skeleton-cards / shimmer-block variants composing Placeholder and Spinner, with a built-in CSS delay-before-show (~120ms) so fast loads never flash.",
  contributions: [],
} satisfies PluginDefinition;
