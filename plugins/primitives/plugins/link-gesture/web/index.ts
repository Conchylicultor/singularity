import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  linkGestureProps,
  type LinkGestureProps,
} from "./internal/link-gesture";

export default {
  description:
    "The browser's link gestures as spreadable handler props: plain click opens here, ⌘/Ctrl- and middle-click open elsewhere. A <button> gets none of this for free, so every navigating control reads it from one place.",
} satisfies PluginDefinition;
