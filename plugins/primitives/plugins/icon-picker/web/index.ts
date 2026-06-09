import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { IconPicker, type IconPickerProps, type IconSelection } from "./components/icon-picker";
export { SvgIcon, type SvgIconProps } from "./components/svg-icon";
export {
  extractSvgNodes,
  loadFullIconSet,
  type SvgNode,
  type FullIconSet,
  type FullIconEntry,
  type FullIconCategory,
} from "./internal/icons";

export default {
  description: "Searchable, categorized icon picker over the full Material Design set. Owns the SvgNode storage format, the icon registry, and server-side SVG resolution; avatar composes it.",
  contributions: [],
} satisfies PluginDefinition;
