import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { registerSlotItemMiddleware } from "@plugins/primitives/plugins/slot-render/web";
import { SuspenseMiddleware } from "./internal/suspense-middleware";

export default {
  name: "Suspense Boundary",
  description:
    "Wraps each slot contribution in a React Suspense boundary so a suspending child (e.g. a config read) shows a local loading spinner instead of blanking a larger region.",
  register: [
    {
      register() {
        registerSlotItemMiddleware({
          // Higher priority than the error boundary (100) → applied inner, so the
          // error boundary stays outermost and still catches genuine throws.
          priority: 200,
          Component: SuspenseMiddleware,
        });
      },
    },
  ],
  contributions: [],
} satisfies PluginDefinition;
