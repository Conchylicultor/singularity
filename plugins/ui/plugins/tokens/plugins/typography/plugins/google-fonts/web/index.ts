import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Core } from "@plugins/framework/plugins/web-sdk/core";
import { GoogleFontsLoader } from "./internal/google-fonts-loader";

export default {
  name: "UI: Typography Google Fonts Loader",
  description:
    "Loads Google Fonts dynamically for typography presets referencing custom web fonts.",
  contributions: [Core.Root({ component: GoogleFontsLoader })],
} satisfies PluginDefinition;
