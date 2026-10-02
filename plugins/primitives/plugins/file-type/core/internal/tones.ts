/**
 * The closed set of colours a file-type glyph is drawn in — Seti's palette.
 * Each tone is a theme token, `--file-<tone>`, declared by the
 * `ui/tokens/file-type-palette` group (light and dark values), so a theme
 * retunes them and nothing here is a hex.
 */
export const FILE_TONES = [
  "blue",
  "yellow",
  "green",
  "red",
  "purple",
  "pink",
  "orange",
  "grey",
  /** Plain text and unknown types: a readable neutral. */
  "neutral",
  /** Metadata nobody opens (`.DS_Store`, git internals): deliberately faint. */
  "ignored",
] as const;
export type FileTone = (typeof FILE_TONES)[number];

/** The token-group key a tone is declared under (`blue` → `fileBlue` → `--file-blue`). */
export type FileToneTokenKey = `file${Capitalize<FileTone>}`;

/** The CSS colour of a tone: its theme token. */
export function fileToneColor(tone: FileTone): string {
  return `var(--file-${tone})`;
}

/** The CSS colour of a folder glyph: the `--folder` theme token. */
export const FOLDER_COLOR = "var(--folder)";
