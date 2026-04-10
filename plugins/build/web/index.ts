import type { PluginDefinition } from "@core";
import { Shell } from "@plugins/shell/web/slots";
import { MdRefresh } from "react-icons/md";

const buildPlugin: PluginDefinition = {
  id: "build",
  name: "Build",
  contributions: [
    Shell.Toolbar({
      label: "Build",
      icon: MdRefresh,
      onClick: () => {
        fetch("/api/build", { method: "POST" });
      },
    }),
  ],
};

export default buildPlugin;
