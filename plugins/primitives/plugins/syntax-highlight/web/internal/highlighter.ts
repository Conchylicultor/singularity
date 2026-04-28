import type { HighlighterGeneric, BundledLanguage, BundledTheme } from "shiki";

const THEMES = ["github-dark-default", "github-light-default"] as const;

const PLAIN_LANGS = new Set(["text", "txt", "plaintext", "plain", "ansi"]);

let highlighterPromise: Promise<
  HighlighterGeneric<BundledLanguage, BundledTheme>
> | null = null;
const langLoaders = new Map<string, Promise<void>>();

export async function getHighlighter(lang?: string) {
  if (!highlighterPromise) {
    highlighterPromise = import("shiki").then((mod) =>
      mod.createHighlighter({ themes: [...THEMES], langs: [] }),
    );
  }
  const hl = await highlighterPromise;
  if (lang && !PLAIN_LANGS.has(lang)) {
    let loader = langLoaders.get(lang);
    if (!loader) {
      loader = hl
        .loadLanguage(lang as BundledLanguage)
        .then(() => {})
        .catch((err) => {
          langLoaders.delete(lang);
          throw err;
        });
      langLoaders.set(lang, loader);
    }
    await loader;
  }
  return hl;
}

export function themeForMode(dark: boolean): (typeof THEMES)[number] {
  return dark ? "github-dark-default" : "github-light-default";
}
