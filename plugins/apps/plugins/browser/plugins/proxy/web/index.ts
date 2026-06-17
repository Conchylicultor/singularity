import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";
import { Browser } from "@plugins/apps/plugins/browser/plugins/shell/web";
import { ProxyToggle } from "./components/proxy-toggle";

export default {
  description:
    "Browser proxy-mode toggle: a shield button in the chrome actions that flips the framing-stripping proxy on/off for the surface.",
  contributions: [Browser.Actions({ id: "proxy-toggle", component: ProxyToggle })],
} satisfies PluginDefinition;
