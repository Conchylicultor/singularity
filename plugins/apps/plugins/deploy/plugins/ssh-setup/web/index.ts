import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Servers } from "@plugins/apps/plugins/deploy/plugins/servers/web";
import { SshSetupSection } from "./components/ssh-setup-section";

export { SshProvider } from "./slots";
export type { SshProviderDescriptor } from "./slots";

export default {
  description:
    "Provider-aware SSH setup for deploy servers: matches the console URL against the generic SshProvider registry and renders the matched provider's guided instructions as a collapsible section inline in the server page's SSH area.",
  contributions: [
    Servers.SshSetup({ id: "ssh-setup", order: 10, component: SshSetupSection }),
  ],
} satisfies PluginDefinition;
