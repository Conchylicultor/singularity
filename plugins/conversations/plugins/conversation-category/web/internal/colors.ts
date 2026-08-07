// The categorical color key space — the same 10 names the avatar primitive uses,
// so an item's configured avatar color and a chart series color agree.
export type ColorKey =
  | "sky"
  | "emerald"
  | "amber"
  | "rose"
  | "violet"
  | "indigo"
  | "teal"
  | "pink"
  | "orange"
  | "slate";

// Subset used for deterministic auto-assignment (stable hash → consistent
// mapping), so an item with no configured avatar color still gets a stable one.
const AUTO_ORDER: ColorKey[] = [
  "sky",
  "emerald",
  "amber",
  "rose",
  "violet",
  "indigo",
  "teal",
  "pink",
];

function hashLabel(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = (h * 33) ^ s.charCodeAt(i);
  }
  return h >>> 0;
}

export function autoColorKey(label: string): ColorKey {
  return AUTO_ORDER[hashLabel(label) % AUTO_ORDER.length]!;
}
