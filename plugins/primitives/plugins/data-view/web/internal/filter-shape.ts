import type { FilterGroup, FilterNode } from "../../core";

/** True when `x` is a valid FilterRule shape. */
function isFilterRule(x: unknown): boolean {
  if (typeof x !== "object" || x === null) return false;
  const r = x as Record<string, unknown>;
  return (
    r.kind === "rule" &&
    typeof r.id === "string" &&
    typeof r.fieldId === "string" &&
    typeof r.operatorId === "string"
    // `value` is intentionally unconstrained (JSON operand, may be absent).
  );
}

/** True when `x` is a valid FilterNode (rule or group) shape, recursively. */
function isFilterNode(x: unknown): x is FilterNode {
  if (typeof x !== "object" || x === null) return false;
  const n = x as Record<string, unknown>;
  if (n.kind === "rule") return isFilterRule(x);
  if (n.kind === "group") return isFilterGroup(x);
  return false;
}

/**
 * Pure structural validator for a persisted filter tree. Rejects stale shapes
 * (e.g. the old `Record<fieldId, value>` filters map) so deserialization can drop
 * them to null instead of silently coercing.
 */
export function isFilterGroup(x: unknown): x is FilterGroup {
  if (typeof x !== "object" || x === null) return false;
  const g = x as Record<string, unknown>;
  if (g.kind !== "group") return false;
  if (typeof g.id !== "string") return false;
  if (g.conjunction !== "and" && g.conjunction !== "or") return false;
  if (!Array.isArray(g.children)) return false;
  return g.children.every(isFilterNode);
}
