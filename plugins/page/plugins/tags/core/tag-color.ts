import { z } from "zod";
// Type-only: the editor's core barrel loads lexical (an async module), and this
// file is in the import graph of `server/internal/tables.ts`, which drizzle-kit
// must `require()` synchronously (`schema-files-loadable`).
import type { ColorToken } from "@plugins/page/plugins/editor/core";

/**
 * A tag's color: the page editor's closed text-color palette minus `default`
 * (a tag always has a hue — `gray` is the neutral one). One palette for text
 * color, callouts and tags, so a theme's `--rt-color-*` tokens paint all three.
 *
 * Listed here rather than derived from the editor's `COLOR_TOKENS` at runtime
 * (see the import above), and held to it by tsc both ways: `satisfies` refuses
 * a hue the palette lacks, and `paletteCovered` refuses a palette hue missing
 * here.
 */
export const TAG_COLORS = [
  "gray",
  "brown",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "red",
] as const satisfies readonly Exclude<ColorToken, "default">[];

export type TagColor = (typeof TAG_COLORS)[number];

const paletteCovered: Exclude<ColorToken, "default"> extends TagColor
  ? true
  : never = true;
void paletteCovered;

export const TagColorSchema = z.enum(TAG_COLORS);

/**
 * The color a tag gets when its creator names none: a stable function of its
 * normalized name, so the same name created twice (two tabs, an agent and a
 * human) lands on the same hue. Gray is skipped — an unpicked color should
 * still read as a color.
 */
export function defaultTagColor(name: string): TagColor {
  const hues = TAG_COLORS.filter((c) => c !== "gray");
  let h = 0;
  for (const ch of tagKey(name)) h = (h * 31 + ch.codePointAt(0)!) >>> 0;
  return hues[h % hues.length]!;
}

/**
 * A tag name's identity: trimmed, inner whitespace collapsed, case-folded. Two
 * names with one key are ONE tag — `In progress`, `in  progress` and
 * `IN PROGRESS` all resolve to the stored spelling. The vocabulary's unique
 * index is on this key, so the database and every resolver agree.
 */
export function tagKey(name: string): string {
  return normalizeTagName(name).toLowerCase();
}

/** A tag name as stored: trimmed, inner whitespace collapsed to one space. */
export function normalizeTagName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

/** The longest tag name accepted. Tags are labels, not sentences. */
export const TAG_NAME_MAX = 40;

/**
 * A tag name a writer may store: non-empty after normalization, at most
 * {@link TAG_NAME_MAX} characters, and free of the characters the `<page-meta>`
 * header and the `[…]` title convention it replaces would choke on.
 */
export const TagNameSchema = z
  .string()
  .transform(normalizeTagName)
  .pipe(
    z
      .string()
      .min(1, "a tag name cannot be empty")
      .max(TAG_NAME_MAX, `a tag name is at most ${TAG_NAME_MAX} characters`)
      .regex(
        /^[^\[\]<>"\n]+$/,
        'a tag name cannot contain [ ] < > " or a line break',
      ),
  );
