import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  isBrowserFullscreen,
  requestBrowserFullscreen,
  exitBrowserFullscreen,
  toggleBrowserFullscreen,
} from "./internal/browser-fullscreen";
export { useBrowserFullscreen } from "./internal/use-browser-fullscreen";

export default {
  description:
    "Native browser fullscreen (Fullscreen API) control: useBrowserFullscreen() reactive state plus request/exit/toggle helpers.",
  contributions: [],
} satisfies PluginDefinition;
