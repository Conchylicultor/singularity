import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { SiHetzner } from "react-icons/si";
import { SshProvider } from "@plugins/apps/plugins/deploy/plugins/ssh-setup/web";
import { HetznerInstructions } from "./components/hetzner-instructions";

export default {
  description:
    "Hetzner Cloud SSH provider: detects console.hetzner.com console URLs and contributes the Hetzner-specific guided key-install flow (generate → web terminal → authorized_keys one-liner).",
  contributions: [
    SshProvider({
      id: "hetzner",
      name: "Hetzner",
      icon: SiHetzner,
      match: (consoleUrl) => consoleUrl.hostname === "console.hetzner.com",
      Instructions: HetznerInstructions,
    }),
  ],
} satisfies PluginDefinition;
