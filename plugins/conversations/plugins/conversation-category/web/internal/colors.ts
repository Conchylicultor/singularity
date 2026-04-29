// Deterministic color palette for category chips. Stable across renders so
// the user learns to associate "Bug" → red even after the configured list is
// reordered, as long as the label string itself doesn't change.

const PALETTE = [
  "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300",
  "bg-teal-500/15 text-teal-700 dark:text-teal-300",
  "bg-pink-500/15 text-pink-700 dark:text-pink-300",
] as const;

function hashString(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return h >>> 0;
}

export function colorClassFor(label: string): string {
  return PALETTE[hashString(label) % PALETTE.length]!;
}
