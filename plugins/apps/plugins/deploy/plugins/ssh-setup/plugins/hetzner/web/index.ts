import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { SiHetzner } from "react-icons/si";
import { SshProvider } from "@plugins/apps/plugins/deploy/plugins/ssh-setup/web";
import { HetznerConsoleInstructions } from "./components/hetzner-console";

export default {
  description:
    "Hetzner Cloud SSH provider: detects console.hetzner.com console URLs so the SSH setup section can name Hetzner and tell the user how to reach a root shell in its web terminal. Console prose only — the key flow belongs to ssh-setup.",
  contributions: [
    SshProvider({
      id: "hetzner",
      name: "Hetzner",
      icon: SiHetzner,
      match: (consoleUrl) => consoleUrl.hostname === "console.hetzner.com",
      ConsoleInstructions: HetznerConsoleInstructions,
    }),
  ],
} satisfies PluginDefinition;
