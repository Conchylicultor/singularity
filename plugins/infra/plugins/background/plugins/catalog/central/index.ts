import type { CentralPluginDefinition } from "@plugins/framework/plugins/central-core/core";
import {
  backgroundCentralCatalogServed,
  backgroundCentralRecentRunsServed,
} from "./internal/live";

// The central twin of the server barrel: a central mechanism declares its
// provider with `defineBackgroundKind` and mounts it in `register`.
export { defineBackgroundKind } from "./internal/define";
export type { BackgroundKind } from "./internal/define";
export type { BackgroundKindSpec } from "../shared/providers";

export default {
  description:
    "Background activity catalog, central half: defineBackgroundKind registers a provider for what the machine-wide central runtime runs on its own, merged into the pushed background.central-catalog value (every entry scope central) with background.central-recent-runs per entry.",
  resources: [
    backgroundCentralCatalogServed,
    backgroundCentralRecentRunsServed,
  ],
} satisfies CentralPluginDefinition;
