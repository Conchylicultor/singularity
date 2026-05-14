import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { useDraft } from "./use-draft";

export default {
  id: "persistent-draft",
  name: "Persistent Draft",
  description:
    "Generic localStorage-backed useState drop-in with optional entity scope and TTL auto-expiry. All useDraft calls sharing the same key stay in sync within and across tabs.",
  contributions: [],
} satisfies PluginDefinition;
