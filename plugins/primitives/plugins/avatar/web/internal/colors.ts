import { AVATAR_COLOR_NAMES, type AvatarColor } from "../../core";

// Two paints per colour, both keyed off the categorical palette slot:
// - SOFT (badge presentation): a 15% tint of the slot with the slot as text —
//   light bg + matching dark text in light mode, muted dark bg + light text in
//   dark mode. Keys align with the conversation-category palette.
// - FLAT (tile presentation): the solid slot under the `categorical-foreground`
//   glyph token, in two shades per slot — shade 1 is `bg-categorical-N-lift`,
//   the slot lifted 0.13 in OKLCH lightness (derived once in ui-kit's app.css) —
//   so the eight automatic slots give sixteen tile colours.
//
// Every class is a literal string so Tailwind's scanner sees it.

export const AVATAR_COLORS = {
  sky: "bg-categorical-1/15 text-categorical-1",
  emerald: "bg-categorical-2/15 text-categorical-2",
  amber: "bg-categorical-3/15 text-categorical-3",
  rose: "bg-categorical-4/15 text-categorical-4",
  violet: "bg-categorical-5/15 text-categorical-5",
  indigo: "bg-categorical-6/15 text-categorical-6",
  teal: "bg-categorical-7/15 text-categorical-7",
  pink: "bg-categorical-8/15 text-categorical-8",
  orange: "bg-categorical-9/15 text-categorical-9",
  slate: "bg-categorical-10/15 text-categorical-10",
} as const satisfies Record<AvatarColor, string>;

/** The flat tile fill per slot: `[shade 0, shade 1]`. */
const AVATAR_FLAT_COLORS = {
  sky: [
    "bg-categorical-1 text-categorical-foreground",
    "bg-categorical-1-lift text-categorical-foreground",
  ],
  emerald: [
    "bg-categorical-2 text-categorical-foreground",
    "bg-categorical-2-lift text-categorical-foreground",
  ],
  amber: [
    "bg-categorical-3 text-categorical-foreground",
    "bg-categorical-3-lift text-categorical-foreground",
  ],
  rose: [
    "bg-categorical-4 text-categorical-foreground",
    "bg-categorical-4-lift text-categorical-foreground",
  ],
  violet: [
    "bg-categorical-5 text-categorical-foreground",
    "bg-categorical-5-lift text-categorical-foreground",
  ],
  indigo: [
    "bg-categorical-6 text-categorical-foreground",
    "bg-categorical-6-lift text-categorical-foreground",
  ],
  teal: [
    "bg-categorical-7 text-categorical-foreground",
    "bg-categorical-7-lift text-categorical-foreground",
  ],
  pink: [
    "bg-categorical-8 text-categorical-foreground",
    "bg-categorical-8-lift text-categorical-foreground",
  ],
  orange: [
    "bg-categorical-9 text-categorical-foreground",
    "bg-categorical-9-lift text-categorical-foreground",
  ],
  slate: [
    "bg-categorical-10 text-categorical-foreground",
    "bg-categorical-10-lift text-categorical-foreground",
  ],
} as const satisfies Record<AvatarColor, readonly [string, string]>;

export const AVATAR_COLOR_KEYS: readonly AvatarColor[] = AVATAR_COLOR_NAMES;

const AUTO_ORDER: readonly AvatarColor[] = [
  "sky",
  "emerald",
  "amber",
  "rose",
  "violet",
  "indigo",
  "teal",
  "pink",
];

function hash(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  return h >>> 0;
}

function isAvatarColor(color: string): color is AvatarColor {
  return Object.hasOwn(AVATAR_COLORS, color);
}

/** Which palette slot an avatar paints, and which of its two tile shades. */
export interface AvatarColorPick {
  slot: AvatarColor;
  /** Tile shade: 0 = the slot, 1 = the slot lifted in lightness. The soft
   *  (badge) paint has one shade per slot and ignores this. */
  shade: 0 | 1;
}

/**
 * The colour an avatar paints. An explicit known `color` wins (shade 0);
 * otherwise `fallbackKey` hashes to one of the eight automatic slots
 * (`hash % 8`) and a shade (`floor(hash / 8) % 2`). `null` = no colour: the
 * neutral muted box.
 */
export function avatarColorPick(
  color: string | null | undefined,
  fallbackKey?: string,
): AvatarColorPick | null {
  if (color && isAvatarColor(color)) return { slot: color, shade: 0 };
  if (!fallbackKey) return null;
  const h = hash(fallbackKey);
  return {
    slot: AUTO_ORDER[h % AUTO_ORDER.length]!,
    shade: Math.floor(h / AUTO_ORDER.length) % 2 === 0 ? 0 : 1,
  };
}

/** Badge paint: the soft tint class for a pick (`bg-muted` for none). */
export function avatarSoftClass(pick: AvatarColorPick | null): string {
  return pick ? AVATAR_COLORS[pick.slot] : "bg-muted";
}

/** Tile paint: the flat fill + categorical-foreground glyph class for a pick. */
export function avatarFlatClass(pick: AvatarColorPick | null): string {
  return pick
    ? AVATAR_FLAT_COLORS[pick.slot][pick.shade]
    : "bg-muted text-foreground";
}

/** The soft (badge) class for a colour / fallback key — `avatarSoftClass(avatarColorPick(…))`. */
export function avatarColorClass(
  color: string | null | undefined,
  fallbackKey?: string,
): string {
  return avatarSoftClass(avatarColorPick(color, fallbackKey));
}
