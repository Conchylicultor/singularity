# Vision: Notion-like DataView Filters

Status: design / vision (v0). Storage migration to the config system is **out of scope** —
v0 persists to localStorage (the existing data-view mechanism) and may drop incompatible
old state.

## Problem

The `data-view` primitive (Notion-like multi-view data surface) has a weak filter system:

- **One baked-in operator per field type.** Each field type contributes a single
  `FilterContribution { match, Control, predicate, isActive }`. Text is always "contains",
  date is always an inclusive "between", enum is always "is one of". There are no named
  operators — no `does not contain`, `is`, `is not`, `is empty`, `before`/`after`, etc.
- **Flat, AND-only.** `ViewState.filters` is a `Record<fieldId, value>`; `useFlatRows`
  applies each entry with sequential `.filter(...)` (implicit AND). No OR, no grouping.
- **Inline bar UI** with no active-filter indicator and no per-rule affordances.

The target is the Notion filter experience (see the reference screenshot): a **"N rules"
pill** that opens a **popover builder** of rule rows — `[conjunction] [field] [operator]
[value]` — with **arbitrarily nested AND/OR groups**, rich per-type operators, and an
`is empty` / value-less operator concept.

## Decisions (locked)

1. **UI model — Notion-style popover builder.** Replace the inline filter bar with a
   trigger that opens a popover. Trigger reads `Filter` when empty, `N rules` (with a funnel
   icon) when active.
2. **Nesting — full nested AND/OR groups.** The filter is a recursive tree of groups and
   rules, any depth, mixed conjunctions per group.
3. **Migration — replace with an operator model.** Each field type contributes a *set of
   operators* instead of one predicate. The old single-`FilterContribution` model is
   removed. All 6 current filter contributors (text, number, date, bool, enum, tags) are
   refactored.

## Architecture

### Boundary / ownership

- **`data-view` owns**: the filter-tree model, the operator *contract*, tree evaluation,
  persistence, and the builder UI. (data-view already owns the `data-view.filter` slot and
  depends on `fields`.)
- **Each field type contributes**: a `FilterOperatorSet` for its type, via the existing
  per-type filter sub-plugin (`plugins/fields/plugins/<type>/plugins/filter/web`). These
  leaf sub-plugins import the contract from `@plugins/.../data-view/web` (dependency
  direction unchanged — only leaf filter sub-plugins depend on data-view, never `fields`
  core).
- Resolution still uses the `extends` chain (`multiline-text`→`text`, `int`/`float`→
  `number`) via `resolveTypeChain`, so inherited types get their parent's operator set for
  free.

### Core contract (data-view core)

```typescript
// Value-input editor props (the operand editor for a single rule).
export interface FilterValueInputProps {
  value: unknown;
  onChange: (value: unknown) => void;
  field: FieldDef<unknown>;
}

// One operator within a field type's operator set.
export interface FilterOperator {
  id: string;                 // unique within the set, e.g. "contains", "is-empty"
  label: string;              // dropdown label, e.g. "Contains", "Is empty"
  hasValue: boolean;          // false → no value editor (is-empty / is-not-empty)
  ValueInput?: ComponentType<FilterValueInputProps>;  // present iff hasValue
  // Pure predicate. operand is the rule's stored value (JSON-safe); fieldValue is the
  // row's projected value (FieldValue | readonly string[]).
  predicate: (operand: unknown, fieldValue: FilterFieldValue) => boolean;
}

// Contribution to the data-view.filter slot — one per field type.
export interface FilterOperatorSet {
  match: string;              // field type id, e.g. "text"
  operators: FilterOperator[];
  defaultOperator?: string;   // op id used when a rule is first created (default: operators[0])
}
```

The `ValueInput` lives **on the operator**, not the type — so `date · is between` (two
pickers) and `date · is` (one picker) can differ, and value-less operators (`is empty`)
render no input.

### Filter tree model (data-view core)

```typescript
export type FilterConjunction = "and" | "or";

export interface FilterRule {
  kind: "rule";
  id: string;                 // local uid (for React keys / edits)
  fieldId: string;
  operatorId: string;
  value?: unknown;            // operand, JSON-serializable
}

export interface FilterGroup {
  kind: "group";
  id: string;
  conjunction: FilterConjunction;
  children: FilterNode[];
}

export type FilterNode = FilterRule | FilterGroup;
```

- `ViewState.filters: Record<string, unknown>` is **replaced** by
  `ViewState.filter: FilterGroup | null` (root is always a group when present).
- Deserialization from localStorage must be **tolerant**: validate the shape; if it does
  not match (e.g. stale `Record` shape from before this change), drop it (treat as null).
  No silent coercion.

### Evaluation (data-view `useFlatRows`)

Replace the flat filter loop with a recursive evaluator:

```
evaluateNode(node, row):
  group: children.length === 0 ? true
         : conjunction === "and" ? children.every(evaluateNode)
                                 : children.some(evaluateNode)
  rule:  field = fields.find(f => f.id === rule.fieldId)
         if !field → true (rule incomplete: don't filter out)
         opSet  = resolveOperatorSet(field.type ?? "text")
         op     = opSet?.operators.find(o => o.id === rule.operatorId)
         if !op → true
         fieldValue = field.values ? field.values(row) : field.value?.(row)
         op.predicate(rule.value, fieldValue)
```

Pipeline order stays: **search → filter (tree) → sort**.

### Builder UI (data-view web)

Replace the filter button + `FilterBar` with:

- **`FilterBuilderTrigger`** — the pill. `Filter` (ghost) when no active rules; `N rules`
  (funnel icon + count, secondary) when active. Counts only *complete* rules (field +
  operator set; value present when `hasValue`). Opens the popover (`popover` primitive).
- **`FilterBuilderPopover`** — popover body hosting the root `FilterGroupEditor`, plus a
  footer with `+ Add filter rule ▾` (Add rule / Add filter group) and `🗑 Delete filter`
  (clears the whole tree → null).
- **`FilterGroupEditor`** (recursive) — renders a group's children. Conjunction display
  follows Notion: child 0 shows static **"Where"**; child 1 shows the editable
  **And/Or dropdown** that sets the *whole group's* conjunction; children 2+ show the
  conjunction as static text. Nested groups render indented inside a bordered container with
  their own `+ Add filter rule`.
- **`FilterRuleRow`** — `[conjunction slot] [FieldPicker ▾] [OperatorPicker ▾]
  [value input]` + a `⋯` menu (delete rule, turn into group). The value input is the
  resolved operator's `ValueInput` (omitted when `hasValue` is false).
- **`FieldPicker`** — dropdown of the schema's *filterable* fields (those whose type chain
  resolves an operator set), each with its field icon + label. Changing the field resets
  the operator to the new type's `defaultOperator` and clears the value.
- **`OperatorPicker`** — dropdown of the current field type's operators. Changing the
  operator clears the value if `hasValue` toggles.

Use existing primitives only: `popover`, `select-scope`, `row`, `icon-button`, `badge` /
`toggle-chip`, `spacing` (Stack/Inset), `text`, `selection-indicator`, the standard
dropdown/`Select` from `ui-kit`. No ad-hoc spacing/radius/z-index/typography (lint-enforced).

### Operator sets (the v0 catalog)

Predicates operate on the field's projected value. Empty = `null`/`undefined`/`""`/`[]`.

- **text** (→ multiline-text via extends):
  `contains` (default), `does-not-contain`, `is`, `is-not`, `is-empty`, `is-not-empty`.
  Value input: single text input (none for empty ops). All case-insensitive for
  contains/is.
- **number** (→ int/float via extends):
  `=`, `≠`, `>`, `<`, `≥`, `≤`, `is-empty`, `is-not-empty`. Single numeric input.
  (Optional `between` with two inputs — include if cheap.)
- **date**:
  `is`, `is-before`, `is-after`, `is-on-or-before`, `is-on-or-after`, `is-between`
  (two date inputs), `is-empty`, `is-not-empty`. Absolute ISO `yyyy-mm-dd` values.
  Relative anchors ("Today", "N days ago") are a **follow-up** (see below).
- **bool**:
  `is` with a Checked/Unchecked value selector (matches the screenshot:
  `Done · Is · Unchecked|Checked`). Optionally `is-not`.
- **enum (select)**:
  `is`, `is-not`, `is-any-of` (multi chip), `is-none-of`, `is-empty`, `is-not-empty`.
- **tags (multi-select)**:
  `contains` (has tag), `does-not-contain`, `contains-any-of`, `contains-all-of`,
  `is-empty`, `is-not-empty`.

### Tests

Pure-logic `bun:test` files co-located with source:
- tree evaluation (and/or, nesting, empty group, missing field/operator) in data-view.
- per-type operator predicates (each operator's truth table, incl. empty handling) next to
  each operator set.

## Consumers (no API break expected)

`<DataView>` is consumed by tasks-list, agents-list, sonata library, tweakcn community
browser, deploy servers, home app-cards, pages-sidebar, story gallery. The `<DataView>`
props surface (fields, rows, views, storageKey) is **unchanged** — only internal filter
state shape and the filter slot contribution type change. Consumers need no edits.

## Known gaps / follow-ups (file as tasks)

1. **Tree view bypasses filtering.** `plugins/data-view/plugins/tree` feeds raw rows to the
   tree primitive and never calls `useFlatRows`, so filters don't apply there. Out of scope
   for this work; file a follow-up to route tree rows through the filter evaluator.
2. **Relative date values** ("Today", "N days/weeks ago", "is within"). v0 ships absolute
   dates only; relative anchors are a follow-up (the screenshot shows `is on or before ·
   Today`).
3. **Config-system persistence.** v0 uses localStorage; migrate the filter tree into the
   config system when that lands.
4. **Saved / named filters** per view (Notion's saved views) — future.
