import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { SiHetzner } from "react-icons/si";
import { SshProvider } from "@plugins/apps/plugins/deploy/plugins/ssh-setup/web";
import {
  OpenConsoleBody,
  InstallKeyBody,
} from "./components/hetzner-instructions";

export default {
  description:
    "Hetzner Cloud SSH provider: detects console.hetzner.com console URLs and contributes the two Hetzner-specific install steps (open the web terminal → paste the authorized_keys one-liner) into the shared SSH setup flow.",
  contributions: [
    SshProvider({
      id: "hetzner",
      name: "Hetzner",
      icon: SiHetzner,
      match: (consoleUrl) => consoleUrl.hostname === "console.hetzner.com",
      // Only the provider-specific half: generating the key and verifying the
      // connection are the flow's own generic first and last steps.
      installSteps: [
        { title: "Open the Hetzner console", Body: OpenConsoleBody },
        { title: "Install the public key", Body: InstallKeyBody },
      ],
    }),
  ],
} satisfies PluginDefinition;
