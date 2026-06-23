import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { useLatestRef, useEventCallback } from "./internal/latest-ref";

export default {
  description:
    "Latest-value ref idiom as a primitive: useLatestRef(value) mirrors the latest value into a ref written in render (read only in callbacks/effects), and useEventCallback(fn) is the stable-identity callback built on it. The single sanctioned home + exemption for the idiom, so react-hooks/refs can be enforced at error.",
  contributions: [],
} satisfies PluginDefinition;
