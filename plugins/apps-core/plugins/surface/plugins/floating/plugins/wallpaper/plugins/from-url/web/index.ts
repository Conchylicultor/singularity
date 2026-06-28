import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdLink } from "react-icons/md";
import { Wallpaper } from "@plugins/apps-core/plugins/surface/plugins/floating/plugins/wallpaper/web";
import { UrlPanel } from "./components/url-panel";

export default {
  description:
    "From-URL wallpaper source: contributes the From URL tab to the desktop wallpaper picker, emitting a pasted image URL the picker imports (and the server validates) via the import-url endpoint.",
  contributions: [
    Wallpaper.Provider({
      id: "from-url",
      label: "From URL",
      icon: MdLink,
      Panel: UrlPanel,
    }),
  ],
} satisfies PluginDefinition;
