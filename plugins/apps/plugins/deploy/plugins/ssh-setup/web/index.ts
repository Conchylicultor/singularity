import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Servers } from "@plugins/apps/plugins/deploy/plugins/servers/web";
import { SshSetupSection } from "./components/ssh-setup-section";

export { SshProvider } from "./slots";
export type { SshProviderDescriptor, SshInstallStep } from "./slots";

export default {
  description:
    "Provider-aware SSH setup for deploy servers: owns the guided <Steps> flow (generate key → the matched provider's install steps → verify the connection) as a collapsible section inline in the server page's SSH area, matching the console URL against the generic SshProvider registry.",
  contributions: [
    Servers.SshSetup({ id: "ssh-setup", order: 10, component: SshSetupSection }),
  ],
} satisfies PluginDefinition;
