const CHIP_NEUTRAL = "bg-muted text-muted-foreground";

export const COLOR_PALETTE = {
  sky:     { swatch: "bg-categorical-1",  chip: CHIP_NEUTRAL },
  emerald: { swatch: "bg-categorical-2",  chip: CHIP_NEUTRAL },
  amber:   { swatch: "bg-categorical-3",  chip: CHIP_NEUTRAL },
  rose:    { swatch: "bg-categorical-4",  chip: CHIP_NEUTRAL },
  violet:  { swatch: "bg-categorical-5",  chip: CHIP_NEUTRAL },
  indigo:  { swatch: "bg-categorical-6",  chip: CHIP_NEUTRAL },
  teal:    { swatch: "bg-categorical-7",  chip: CHIP_NEUTRAL },
  pink:    { swatch: "bg-categorical-8",  chip: CHIP_NEUTRAL },
  orange:  { swatch: "bg-categorical-9",  chip: CHIP_NEUTRAL },
  slate:   { swatch: "bg-categorical-10", chip: CHIP_NEUTRAL },
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

export function colorClassFor(_label: string): string {
  return CHIP_NEUTRAL;
}
