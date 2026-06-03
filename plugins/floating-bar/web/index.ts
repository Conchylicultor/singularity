import { Core, type PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { ConfigV2 } from "@plugins/config_v2/web";
import { FloatingBar } from "./components/floating-bar";
import { floatingBarConfig } from "../shared/config";

export default {
  name: "Floating Bar",
  description:
    "Floating action bar (top-right) surfacing the main toolbar's actions in every app. Collapses to a status icon; expands on hover.",
  contributions: [
    Core.Root({ component: FloatingBar }),
    ConfigV2.WebRegister({ descriptor: floatingBarConfig }),
  ],
} satisfies PluginDefinition;
