import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { defineVariantRegionWeb } from "./define-variant-region-web";
export type { VariantRegionWeb } from "./define-variant-region-web";
export type { VariantContribution } from "./slots";

export default {
  description:
    "Factory for pluggable chrome regions with per-app switchable variants. Collapses the config + slot + host + picker + registrations boilerplate into defineVariantRegion (core) and defineVariantRegionWeb (web).",
  contributions: [],
} satisfies PluginDefinition;
