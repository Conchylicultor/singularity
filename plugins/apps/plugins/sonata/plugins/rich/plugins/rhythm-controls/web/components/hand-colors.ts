/**
 * Each hand's colour, as the two forms its two surfaces need: the circle's
 * ring takes a CSS colour (`colorVar`), the hand row's dot a background class.
 * One table, so a hand's dot and its ring can never disagree. The right hand
 * (chords) wears the accent; the left hand (bass) the second chart colour.
 */
export const HAND_COLORS = {
  chord: { colorVar: "var(--primary)", dotClass: "bg-primary" },
  bass: { colorVar: "var(--chart-2)", dotClass: "bg-chart-2" },
} as const;

export type Hand = keyof typeof HAND_COLORS;
