import { db } from "@plugins/database/server";
import { _agents } from "./tables";

/**
 * True when `candidateId` sits inside `ancestorId`'s subtree — the cycle guard
 * both re-parenting paths (`handle-update`'s plain re-parent and
 * `handle-move`'s drag) run before writing a new `parentId`. Shared so the two
 * cannot drift into disagreeing about what a cycle is.
 */
export async function isAgentDescendant(
  ancestorId: string,
  candidateId: string,
): Promise<boolean> {
  const all = await db
    .select({ id: _agents.id, parentId: _agents.parentId })
    .from(_agents);
  const byId = new Map(all.map((r) => [r.id, r.parentId] as const));
  let cur: string | null = candidateId;
  const seen = new Set<string>();
  while (cur) {
    if (cur === ancestorId) return true;
    if (seen.has(cur)) return false;
    seen.add(cur);
    cur = byId.get(cur) ?? null;
  }
  return false;
}
