import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  Switch,
  SwitchIndicator,
  type SwitchProps,
  type SwitchIndicatorProps,
} from "./internal/switch";

export default {
  description:
    "On/off switch primitive: SwitchIndicator is the presentational track+knob (a span with no role or handler, safe inside something that is already the click target), and Switch wraps it in its own role=switch button for standalone use.",
  contributions: [],
} satisfies PluginDefinition;
