import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { configBootTask } from "./internal/boot";

export { useConfig } from "./internal/use-config";
export { useSetConfig } from "./internal/use-set-config";
export { useScopeMembership } from "./internal/use-scope-membership";
export { useConfigRegistrations } from "./internal/use-config-registrations";
export type { ConfigRegistration } from "./internal/use-config-registrations";
export { ConfigV2 } from "./internal/slots";

export default {
  collapsed: true,
  description: "Reactive useConfig hook for reading typed JSONC config in the browser.",
  contributions: [configBootTask],
} satisfies PluginDefinition;
