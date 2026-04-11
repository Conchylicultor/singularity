import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web/commands";
import { Shell as ShellSlots } from "@plugins/shell/web/slots";
import { MdRefresh } from "react-icons/md";

const buildPlugin: PluginDefinition = {
  id: "build",
  name: "Build",
  contributions: [
    ShellSlots.Toolbar({
      label: "Build",
      icon: MdRefresh,
      onClick: async () => {
        Shell.Toast({ description: "Build started…", variant: "info" });
        try {
          const res = await fetch("/api/build", { method: "POST" });
          const { exitCode } = await res.json();
          if (exitCode === 0) {
            Shell.Toast({ description: "Build succeeded", variant: "success" });
          } else {
            Shell.Toast({ description: `Build failed (exit ${exitCode})`, variant: "error" });
          }
        } catch (err) {
          Shell.Toast({ description: "Build request failed", variant: "error" });
        }
      },
      group: "actions",
    }),
  ],
};

export default buildPlugin;
