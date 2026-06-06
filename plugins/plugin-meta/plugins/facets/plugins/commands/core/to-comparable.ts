import type { CommandDef } from "./types";

/** Diff projection: one `Group.Member` string per command. Mirrors renderDoc
 *  (facet/index.ts) so the diff output matches the doc rendering. No legacy
 *  commandStrings() existed in compute-plugin-diff.ts — this defines the diff. */
export function commandsToComparable(data: CommandDef[]): string[] {
  return data.map((c) => `${c.groupName}.${c.memberName}`);
}
