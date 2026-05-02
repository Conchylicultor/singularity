// Full-saturation Tailwind hues for filled avatar discs. Keys are aligned
// with the conversation-category palette so the two systems read consistently
// even though they don't share the file (avatars are filled, chips are muted).

export const AVATAR_COLORS = {
  sky: "bg-sky-500",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  violet: "bg-violet-500",
  indigo: "bg-indigo-500",
  teal: "bg-teal-500",
  pink: "bg-pink-500",
  orange: "bg-orange-500",
  slate: "bg-slate-500",
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
