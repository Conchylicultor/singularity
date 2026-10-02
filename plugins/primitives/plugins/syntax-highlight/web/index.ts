import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export { getHighlighter, themeForMode } from "./internal/highlighter";
export { SHIKI_LANGS, languageForPath, resolveLang } from "./internal/lang";
export { useDarkMode } from "./internal/use-dark-mode";
export { HighlightedCode } from "./internal/highlighted-code";
export {
  CodeListing,
  type CodeListingProps,
  type CodeListingVariant,
} from "./internal/code-listing";
export { useHighlightedHtml } from "./internal/use-highlighted-html";
export type {
  HighlightedHtmlResult,
  UseHighlightedHtmlOptions,
} from "./internal/use-highlighted-html";

export default {
  description:
    "Shared shiki-based syntax highlighter primitive. Exposes getHighlighter, themeForMode, languageForPath, useDarkMode, a <HighlightedCode> component for plugins rendering code, and <CodeListing> — the line-numbered listing (block or full-pane, optional highlighted line) behind transcript Read results and the file viewer's Code tab.",
  contributions: [],
} satisfies PluginDefinition;
