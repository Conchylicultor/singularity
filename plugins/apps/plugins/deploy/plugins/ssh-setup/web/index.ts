import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Servers } from "@plugins/apps/plugins/deploy/plugins/servers/web";
import { SshSetupSection } from "./components/ssh-setup-section";

export { SshProvider } from "./slots";
export type { SshProviderDescriptor, SshConsoleProps } from "./slots";

export default {
  description:
    "SSH setup for deploy servers: owns the whole key flow (generate / paste-and-derive / fingerprint / install command / verify the connection / replace) as a collapsible section that always renders, and decorates it with the matched SshProvider's console prose when the server's console URL identifies one.",
  contributions: [
    Servers.SshSetup({ id: "ssh-setup", order: 10, component: SshSetupSection }),
  ],
} satisfies PluginDefinition;
