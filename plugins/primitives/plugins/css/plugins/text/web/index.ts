import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  Text,
  type TextProps,
  type TextVariant,
  type TextTone,
} from "./internal/text";
export { SectionLabel, type SectionLabelProps } from "./internal/section-label";

export default {
  description:
    "Semantic typography primitive: <Text variant tone as> picks a frozen size/line-height/weight role from the typography token group (incl. the eyebrow/section-label role). The single sanctioned home for text hierarchy; raw text-size/leading-* is banned by no-adhoc-typography.",
  contributions: [],
} satisfies PluginDefinition;
