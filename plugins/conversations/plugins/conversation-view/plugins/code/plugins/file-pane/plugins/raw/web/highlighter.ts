import type { HighlighterGeneric, BundledLanguage, BundledTheme } from "shiki";
import { SHIKI_LANGS } from "./lang";

const THEMES = ["github-dark-default", "github-light-default"] as const;

let highlighterPromise: Promise<
  HighlighterGeneric<BundledLanguage, BundledTheme>
> | null = null;

export function getHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = import("shiki").then((mod) =>
      mod.createHighlighter({
        themes: [...THEMES],
        langs: SHIKI_LANGS,
      }),
    );
  }
  return highlighterPromise;
}

export function themeForMode(dark: boolean): (typeof THEMES)[number] {
  return dark ? "github-dark-default" : "github-light-default";
}
