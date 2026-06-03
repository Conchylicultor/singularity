import type { CentralPluginDefinition } from "@plugins/framework/plugins/central-core/core";

export { readSecretConfig } from "./internal/read-secret-config";

export default {
  name: "Config v2: Secret Field (central)",
  description: "Central-side secret config reader for auth providers.",
} satisfies CentralPluginDefinition;
