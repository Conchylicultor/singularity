// Soft pastel hues for avatar discs — light bg + matching dark text (light mode),
// muted dark bg + light text (dark mode). Keys align with the conversation-category palette.

export const AVATAR_COLORS = {
  sky: "bg-sky-100 text-sky-700 dark:bg-sky-900/60 dark:text-sky-300",
  emerald: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300",
  amber: "bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300",
  rose: "bg-rose-100 text-rose-700 dark:bg-rose-900/60 dark:text-rose-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-900/60 dark:text-violet-300",
  indigo: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300",
  teal: "bg-teal-100 text-teal-700 dark:bg-teal-900/60 dark:text-teal-300",
  pink: "bg-pink-100 text-pink-700 dark:bg-pink-900/60 dark:text-pink-300",
  orange: "bg-orange-100 text-orange-700 dark:bg-orange-900/60 dark:text-orange-300",
  slate: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
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
