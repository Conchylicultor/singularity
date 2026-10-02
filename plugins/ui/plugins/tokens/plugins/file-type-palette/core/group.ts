import type { FileToneTokenKey } from "@plugins/primitives/plugins/file-type/core";
import {
  defineTokenGroup,
  type TokenGroupSchema,
} from "@plugins/ui/plugins/theme-engine/core";

/**
 * The file-type tints: the closed set of colours a file-type glyph is drawn in
 * (`primitives/file-type`'s `FileTone`), plus the folder colour.
 *
 * `defineTokenGroup` kebab-cases each key, so `fileBlue` → `--file-blue`. The
 * dark values are Seti's own palette (jesseweed/seti-ui `ui-variables.less`,
 * the colours VS Code's Seti icon theme draws on a dark editor); the light
 * values are those darkened by 10%, as VS Code derives its light Seti theme —
 * except the two near-white/near-grey tones, which a light page needs dark.
 *
 * The keys are a CONTRACT with `primitives/file-type` (`FILE_TONES`): one key
 * per tone, spelled `file<Tone>`, plus `folder` — checked by tsc below (a
 * missing or extra tone does not compile).
 */
const schema = {
  fileBlue: { default: "#498ba7", darkDefault: "#519aba", label: "Blue" },
  fileYellow: { default: "#b7b73a", darkDefault: "#cbcb41", label: "Yellow" },
  fileGreen: { default: "#7fae42", darkDefault: "#8dc149", label: "Green" },
  fileRed: { default: "#b8383d", darkDefault: "#cc3e44", label: "Red" },
  filePurple: { default: "#9068b0", darkDefault: "#a074c4", label: "Purple" },
  filePink: { default: "#dd4b78", darkDefault: "#f55385", label: "Pink" },
  fileOrange: { default: "#cc6d2e", darkDefault: "#e37933", label: "Orange" },
  fileGrey: { default: "#627379", darkDefault: "#6d8086", label: "Grey" },
  // Seti's "white" (plain text, unknown types): a readable neutral on either page.
  fileNeutral: { default: "#5f6b70", darkDefault: "#d4d7d6", label: "Neutral" },
  // Seti's "ignore" (.DS_Store, git metadata): deliberately faint.
  fileIgnored: { default: "#9aa7ad", darkDefault: "#41535b", label: "Ignored" },
  folder: { default: "#3b82f6", darkDefault: "#60a5fa", label: "Folder" },
} satisfies Record<FileToneTokenKey | "folder", TokenGroupSchema[string]>;

export const fileTypePaletteGroup = defineTokenGroup(
  "file-type-palette",
  schema,
);

export type FileTypePaletteValues = {
  [K in keyof typeof fileTypePaletteGroup.schema]: string;
};
