import type { CentralPluginDefinition } from "@plugins/framework/plugins/central-core/core";

export { readSecretConfig } from "./internal/read-secret-config";

export default {
  name: "Fields: Secret Config (central)",
  description: "Central-side secret config reader for auth providers.",
} satisfies CentralPluginDefinition;
