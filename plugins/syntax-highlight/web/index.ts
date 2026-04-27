import type { PluginDefinition } from "@core";

export { getHighlighter, themeForMode } from "./internal/highlighter";
export { SHIKI_LANGS, languageForPath, resolveLang } from "./internal/lang";
export { useDarkMode } from "./internal/use-dark-mode";
export { HighlightedCode } from "./internal/highlighted-code";

export default {
  id: "syntax-highlight",
  name: "Syntax Highlight",
  description:
    "Shared shiki-based syntax highlighter primitive. Exposes getHighlighter, themeForMode, languageForPath, useDarkMode, and a <HighlightedCode> component for plugins rendering code.",
  contributions: [],
} satisfies PluginDefinition;
