import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { IconPicker, type IconPickerProps } from "./components/icon-picker";

export default {
  description:
    "Searchable, categorized picker over the Material Symbols set: a windowed grid of runtime-symbol cells browsing and searching Google's vendored Material Symbols metadata; onSelect hands back the picked SavedSymbolName. avatar, the page icon button and the callout panel compose it.",
  contributions: [],
} satisfies PluginDefinition;
