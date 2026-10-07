import type { HighlighterGeneric, BundledLanguage, BundledTheme } from "shiki";

const THEMES = ["github-dark-default", "github-light-default"] as const;

const PLAIN_LANGS = new Set(["text", "txt", "plaintext", "plain", "ansi"]);

let highlighterPromise: Promise<
  HighlighterGeneric<BundledLanguage, BundledTheme>
> | null = null;
const langLoaders = new Map<string, Promise<void>>();
type Theme = (typeof THEMES)[number];

/**
 * Each theme's own background, known before shiki loads so a surface painted
 * with it is right from the first frame (no app-colour flash while the
 * highlighter and the file load). Checked against shiki's theme the first time
 * the highlighter loads — a shiki upgrade that changes one fails loudly.
 */
const THEME_BACKGROUNDS: Record<Theme, string> = {
  "github-dark-default": "#0d1117",
  "github-light-default": "#ffffff",
};
let backgroundsChecked = false;

export async function getHighlighter(lang?: string) {
  if (!highlighterPromise) {
    highlighterPromise = import("shiki").then((mod) =>
      mod.createHighlighter({ themes: [...THEMES], langs: [] }),
    );
  }
  const hl = await highlighterPromise;
  if (!backgroundsChecked) {
    backgroundsChecked = true;
    for (const theme of THEMES) {
      const actual = hl.getTheme(theme).bg.toLowerCase();
      if (actual !== THEME_BACKGROUNDS[theme]) {
        throw new Error(
          `syntax-highlight: THEME_BACKGROUNDS["${theme}"] is ${THEME_BACKGROUNDS[theme]} but shiki paints ${actual} — update the constant`,
        );
      }
    }
  }
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

export function themeForMode(dark: boolean): Theme {
  return dark ? "github-dark-default" : "github-light-default";
}

/** The highlight theme's background colour for a light or dark surface. */
export function codeBackground(dark: boolean): string {
  return THEME_BACKGROUNDS[themeForMode(dark)];
}
