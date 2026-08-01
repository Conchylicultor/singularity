import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdVpnKey } from "react-icons/md";
import { ServerDetail } from "@plugins/apps/plugins/deploy/plugins/servers/web";
import { useServerVerified } from "@plugins/apps/plugins/deploy/plugins/health/web";
import { SshSetupSection } from "./components/ssh-setup-section";
import { SshSetupActions } from "./components/ssh-setup-actions";

export { SshProvider } from "./slots";
export type { SshProviderDescriptor, SshConsoleProps } from "./slots";

export default {
  description:
    "SSH setup for deploy servers: owns the whole key flow (generate / paste-and-derive / fingerprint / install command / verify the connection / replace) as a collapsible section that always renders, and decorates it with the matched SshProvider's console prose when the server's console URL identifies one.",
  contributions: [
    ServerDetail.Section({
      id: "ssh-setup",
      // The title is the SECTION's identity, so it is static and per-server
      // decoration stays out of it: the matched provider is a chip in `actions`
      // (`SshSetupActions`), where it reads as a fact about this server rather
      // than as a card whose name changes row to row. Same for the icon — a key
      // names what the section does; the provider's own icon rides its chip.
      label: "Set up SSH access",
      icon: MdVpnKey,
      actions: SshSetupActions,
      // Expanded while action is needed; collapsed to one row once the
      // connection is actually proven. This only SEEDS the persisted open state
      // (the host resolves it once per mount), so it never yanks a card the user
      // has touched. Keyed on `verified`, not on holding a key — minting one is
      // the first step of the flow, not the end of it.
      useDefaultOpen: ({ server }) => !useServerVerified(server),
      component: SshSetupSection,
    }),
  ],
} satisfies PluginDefinition;
