export const COLOR_PALETTE = {
  sky:     { swatch: "bg-sky-400",     chip: "bg-sky-500/15 text-sky-700 dark:text-sky-300" },
  emerald: { swatch: "bg-emerald-400", chip: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  amber:   { swatch: "bg-amber-400",   chip: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  rose:    { swatch: "bg-rose-400",    chip: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
  violet:  { swatch: "bg-violet-400",  chip: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
  indigo:  { swatch: "bg-indigo-400",  chip: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300" },
  teal:    { swatch: "bg-teal-400",    chip: "bg-teal-500/15 text-teal-700 dark:text-teal-300" },
  pink:    { swatch: "bg-pink-400",    chip: "bg-pink-500/15 text-pink-700 dark:text-pink-300" },
  orange:  { swatch: "bg-orange-400",  chip: "bg-orange-500/15 text-orange-700 dark:text-orange-300" },
  slate:   { swatch: "bg-slate-400",   chip: "bg-slate-500/15 text-slate-700 dark:text-slate-300" },
} as const;

export type ColorKey = keyof typeof COLOR_PALETTE;
export const COLOR_KEYS = Object.keys(COLOR_PALETTE) as ColorKey[];

// Subset used for deterministic auto-assignment (stable hash → consistent mapping)
export const AUTO_ORDER: ColorKey[] = ["sky", "emerald", "amber", "rose", "violet", "indigo", "teal", "pink"];

export function hashLabel(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return h >>> 0;
}

export function autoColorKey(label: string): ColorKey {
  return AUTO_ORDER[hashLabel(label) % AUTO_ORDER.length]!;
}

export function colorClassFor(label: string, overrides?: Record<string, string>): string {
  const key = overrides?.[label];
  if (key && key in COLOR_PALETTE) return COLOR_PALETTE[key as ColorKey].chip;
  return COLOR_PALETTE[autoColorKey(label)].chip;
}
