import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  CheckboxIndicator,
  RadioIndicator,
  type SelectionIndicatorProps,
} from "./internal/selection-indicator";

export default {
  description:
    "Presentational checkbox / radio indicator boxes (border + fill + glyph) with the correct preset-independent fixed shape baked in (rounded-checkbox for the checkbox, rounded-full for the radio). The sanctioned home for styled selection indicators so the fixed shape lives in one place and consumers never write radius classes.",
  contributions: [],
} satisfies PluginDefinition;
