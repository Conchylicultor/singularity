import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { EmojiPicker, type EmojiPickerProps } from "./components/emoji-picker";
export { EmojiGlyph } from "./components/emoji-glyph";

export default {
  description:
    "The <EmojiPicker>: a searchable, categorized emoji grid over frimousse whose emojibase data is served same-origin by the asset mirror; onSelect hands back a parsed Emoji. Plus <EmojiGlyph>, which draws an emoji in an icon's box (sized by the same size-* class). The page icon picker and <PageIcon> compose them.",
  contributions: [],
} satisfies PluginDefinition;
