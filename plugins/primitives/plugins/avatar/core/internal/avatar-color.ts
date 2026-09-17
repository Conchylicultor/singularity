/**
 * The closed avatar colour list — each name is one categorical palette slot
 * (`sky` → `--categorical-1`, … `slate` → `--categorical-10`), in slot order.
 * Runtime-agnostic data so a non-web descriptor (an app icon's declared colour)
 * can type its colour without importing the web avatar.
 */
export const AVATAR_COLOR_NAMES = [
  "sky",
  "emerald",
  "amber",
  "rose",
  "violet",
  "indigo",
  "teal",
  "pink",
  "orange",
  "slate",
] as const;

export type AvatarColor = (typeof AVATAR_COLOR_NAMES)[number];

/** The avatar box's outline: a disc, or a launcher-style squircle. */
export type AvatarShape = "circle" | "squircle";
