import type {
  FieldDef,
  FilterOperator,
  FilterOperatorSet,
  FilterRule,
} from "../../core";

/** True when `value` is a present operand (not null/undefined/""/[]). */
export function hasOperand(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value !== "";
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/**
 * Resolve a rule's field + operator, or `null` when either is unresolvable (a
 * dangling rule whose field/operator no longer exists in the schema). The single
 * place that maps `(fieldId, operatorId)` → live `{ field, op }`, so the
 * evaluator and the rule counter resolve identically.
 */
export function resolveRuleOperator<TRow>(
  rule: FilterRule,
  fields: FieldDef<TRow>[],
  resolveOperatorSet: (typeId: string) => FilterOperatorSet | undefined,
): { field: FieldDef<TRow>; op: FilterOperator } | null {
  const field = fields.find((f) => f.id === rule.fieldId);
  if (!field) return null;
  const op = resolveOperatorSet(field.type ?? "text")?.operators.find(
    (o) => o.id === rule.operatorId,
  );
  if (!op) return null;
  return { field, op };
}

/**
 * THE single definition of "this rule constrains rows". Both the evaluator (an
 * incomplete rule is a no-op → keeps every row) and the rule counter (the chip
 * badge) ask this one question, so counting and filtering can never disagree —
 * the bug where a value-less `bool` rule silently filtered while the chip showed
 * "0 rules" came from two divergent notions of completeness.
 *
 * The operator owns the answer via optional `isComplete` (e.g. `bool` treats an
 * absent value as "Unchecked" — a real constraint), falling back to generic
 * operand presence: a value-taking operator needs a present operand; a
 * value-less operator (`is empty`) is always complete.
 */
export function isOperatorComplete(op: FilterOperator, value: unknown): boolean {
  if (op.isComplete) return op.isComplete(value);
  return op.hasValue ? hasOperand(value) : true;
}

/**
 * Whether a rule both resolves and is complete — i.e. it actually filters. The
 * counter's per-rule predicate; the evaluator inlines the same two checks to
 * avoid resolving twice per row.
 */
export function isRuleActive<TRow>(
  rule: FilterRule,
  fields: FieldDef<TRow>[],
  resolveOperatorSet: (typeId: string) => FilterOperatorSet | undefined,
): boolean {
  const resolved = resolveRuleOperator(rule, fields, resolveOperatorSet);
  return resolved !== null && isOperatorComplete(resolved.op, rule.value);
}
