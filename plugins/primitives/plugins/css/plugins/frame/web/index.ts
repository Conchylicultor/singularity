import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { Frame, type FrameProps, type FrameAlign } from "./internal/frame";

export default {
  description:
    "Named-slot row layout primitive: <Frame leading content meta trailing> lays four role slots on a CSS grid with the shrink hierarchy baked in — rigid clusters never crush, content truncates last, meta truncates first. Callers write roles, never min-w-0/shrink-0/flex-1 mechanics.",
  contributions: [],
} satisfies PluginDefinition;
