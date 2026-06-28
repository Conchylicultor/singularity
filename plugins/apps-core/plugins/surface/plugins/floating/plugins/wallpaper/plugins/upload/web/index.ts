import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { MdUpload } from "react-icons/md";
import { Wallpaper } from "@plugins/apps-core/plugins/surface/plugins/floating/plugins/wallpaper/web";
import { UploadPanel } from "./components/upload-panel";

export default {
  description:
    "Upload wallpaper source: contributes the Upload tab to the desktop wallpaper picker, emitting a local image file the picker funnels through the upload endpoint.",
  contributions: [
    Wallpaper.Provider({
      id: "upload",
      label: "Upload",
      icon: MdUpload,
      Panel: UploadPanel,
    }),
  ],
} satisfies PluginDefinition;
