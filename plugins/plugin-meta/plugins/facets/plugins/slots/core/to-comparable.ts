import type { SlotDef } from "./types";

/** Diff projection: one `"<group>.<member>"` string per slot.
 *  Mirrors the legacy slotStrings() (compute-plugin-diff.ts) — `node.slots`
 *  unfiltered, so runtime-only slots are included to preserve identical diff output. */
export function slotsToComparable(data: SlotDef[]): string[] {
  return data.map((s) => `${s.groupName}.${s.memberName}`);
}
