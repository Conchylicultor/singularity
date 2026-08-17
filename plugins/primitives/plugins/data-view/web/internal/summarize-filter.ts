import type {
  FieldDef,
  FilterGroup,
  FilterNode,
  FilterOperatorSet,
  FilterRule,
} from "../../core";
import type { DataViewControlSummary } from "../slots";
import { isRuleActive, resolveRuleOperator } from "./rule-resolution";

/** Depth-first flatten of the tree into its leaf rules, in reading order. */
function flatten(node: FilterNode, out: FilterRule[]): void {
  if (node.kind === "group") {
    for (const child of node.children) flatten(child, out);
    return;
  }
  out.push(node);
}

/**
 * Render an operand the way a person would say it.
 *
 * The operator gets first refusal (`FilterOperator.summarize`) because the
 * operand's SHAPE is the operator's own — only `date · is between` knows that its
 * operand is a pair of instants, and only `bool · is` knows that an absent
 * operand means "unchecked". Everything else falls back generically, and an
 * operand with no readable generic form is OMITTED rather than stringified into
 * `[object Object]`: a summary that says less is fine, one that says garbage is
 * not.
 */
function describeOperand(
  value: unknown,
  field: FieldDef<unknown>,
  summarize?: (
    operand: unknown,
    field: FieldDef<unknown>,
  ) => string | undefined,
): string | undefined {
  const own = summarize?.(value, field);
  if (own !== undefined) return own;
  if (typeof value === "string") return value === "" ? undefined : value;
  if (typeof value === "number" || typeof value === "boolean")
    return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return undefined;
    // One choice reads as the choice; several read as a count, because spelling
    // out five option labels is what made the closed trigger wider than the
    // panel it opens.
    if (value.length === 1) {
      const only = value[0];
      if (typeof only !== "string") return undefined;
      return field.options?.find((o) => o.value === only)?.label ?? only;
    }
    return String(value.length);
  }
  return undefined;
}

/**
 * What the closed Filter control says — in its trigger's tooltip + accessible
 * name, and as the compact fold's row text: the first ACTIVE rule in words, plus
 * how many further active rules there are.
 *
 * "Active" is `isRuleActive` — the same predicate the evaluator and
 * `FilterController.ruleCount` use, imported rather than re-derived. That is the
 * whole point: a summary reading "1 rule" beside an evaluator honouring two is
 * exactly the class of bug `rule-resolution.ts` was written to close, and it can
 * only come back if someone writes a second notion of "counts".
 *
 * Pure: it takes state, never hooks, so the trigger renders without mounting the
 * panel (see `DataViewControlContribution.summary`).
 */
export function summarizeFilter(
  filter: FilterGroup | null,
  fields: FieldDef<unknown>[],
  resolveOperatorSet: (typeId: string) => FilterOperatorSet | undefined,
): DataViewControlSummary | null {
  if (!filter) return null;

  const rules: FilterRule[] = [];
  flatten(filter, rules);
  const active = rules.filter((r) =>
    isRuleActive(r, fields, resolveOperatorSet),
  );

  const first = active[0];
  if (!first) return null;

  // Non-null by construction: `isRuleActive` already resolved it.
  const resolved = resolveRuleOperator(first, fields, resolveOperatorSet);
  if (!resolved) return null;
  const { field, op } = resolved;

  const operand = op.hasValue
    ? describeOperand(first.value, field, op.summarize)
    : undefined;
  const label = [field.label, op.label.toLowerCase(), operand]
    .filter((part) => part !== undefined && part !== "")
    .join(" ");

  return { label, more: active.length - 1 };
}
