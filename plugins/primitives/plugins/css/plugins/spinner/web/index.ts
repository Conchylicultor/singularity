import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { Spinner, type SpinnerProps } from "./internal/spinner";

export default {
  description:
    'Spinner for loading states: the spinning refresh glyph (default) or, with shape="ring", a thin ring (hover-tone track, current-colour arc). Always spinning by default; spinning={false} pauses.',
  contributions: [],
} satisfies PluginDefinition;
