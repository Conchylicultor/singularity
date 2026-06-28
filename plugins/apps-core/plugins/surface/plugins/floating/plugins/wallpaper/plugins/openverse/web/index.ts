import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdImageSearch } from "react-icons/md";
import { Wallpaper } from "@plugins/apps-core/plugins/surface/plugins/floating/plugins/wallpaper/web";
import { OpenversePanel } from "./components/openverse-panel";

export default {
  description:
    "Openverse wallpaper source: contributes the Openverse tab to the desktop wallpaper picker, reusing the shared search panel over the server-side `openverse` provider.",
  contributions: [
    Wallpaper.Provider({
      id: "openverse",
      label: "Openverse",
      icon: MdImageSearch,
      Panel: OpenversePanel,
    }),
  ],
} satisfies PluginDefinition;
