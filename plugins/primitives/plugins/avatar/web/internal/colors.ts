// Soft pastel hues for avatar discs — light bg + matching dark text (light mode),
// muted dark bg + light text (dark mode). Keys align with the conversation-category palette.

export const AVATAR_COLORS = {
  sky:     "bg-categorical-1/15 text-categorical-1",
  emerald: "bg-categorical-2/15 text-categorical-2",
  amber:   "bg-categorical-3/15 text-categorical-3",
  rose:    "bg-categorical-4/15 text-categorical-4",
  violet:  "bg-categorical-5/15 text-categorical-5",
  indigo:  "bg-categorical-6/15 text-categorical-6",
  teal:    "bg-categorical-7/15 text-categorical-7",
  pink:    "bg-categorical-8/15 text-categorical-8",
  orange:  "bg-categorical-9/15 text-categorical-9",
  slate:   "bg-categorical-10/15 text-categorical-10",
} as const;

export type AvatarColor = keyof typeof AVATAR_COLORS;
export const AVATAR_COLOR_KEYS = Object.keys(AVATAR_COLORS) as AvatarColor[];

const AUTO_ORDER: AvatarColor[] = [
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

export function avatarColorClass(color: string | null | undefined, fallbackKey?: string): string {
  if (color && color in AVATAR_COLORS) return AVATAR_COLORS[color as AvatarColor];
  if (fallbackKey) return AVATAR_COLORS[AUTO_ORDER[hash(fallbackKey) % AUTO_ORDER.length]!];
  return "bg-muted";
}
