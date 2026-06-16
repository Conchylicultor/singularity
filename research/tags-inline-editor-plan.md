# Tags inline cell editor — design

## Problem

The per-field inline cell-editor capability (`fields/plugins/<name>/plugins/inline`
contributing `DataViewSlots.CellEditor`) covers text/number/bool/enum/date — all
**scalar** types projected via `FieldDef.value` and committed via the scalar
`CellEditorProps.onCommit(next: FieldValue)`.

`tags` is a **multi-value** type: it projects via `FieldDef.values(row) => string[]`
(mutually exclusive with `value`). It has no inline editor and no commit channel
that carries an array. It also has no read-only table cell at all.

## Design: the value/values duality, extended end-to-end

The repo already splits scalar vs multi at the projection layer (`value` vs
`values`). We mirror that same split through the *edit* and *cell* layers instead of
inventing a new mechanism:

| concern        | scalar            | multi-value (tags)        |
|----------------|-------------------|---------------------------|
| projection     | `value`           | `values`                  |
| write-back     | `onEdit`          | `onEditValues` (new)      |
| editor commit  | `onCommit`        | `onCommitValues` (new)    |
| editor current | `value`           | `values` (new)            |
| read cell prop | `value`           | `values` (new)            |

No widening of `FieldValue` / `onEdit` (which would break every existing scalar
consumer under strict contravariance). Additive only — every scalar consumer is
untouched; a multi-value consumer opts in by providing `values` + `onEditValues`.

### Touched (data-view primitive — sanctioned by the task)

1. `core/internal/types.ts` — add `FieldDef.onEditValues`, `TableCellProps.values`,
   `CellEditorProps.{values, onCommitValues}`.
2. `web/cell-slot.ts` — `useResolveCell` gains a trailing optional `values` arg
   (backward-compatible; tree-view's 3-arg call still works).
3. `web/cell-editor-slot.ts` — `useResolveCellEditor` takes an options object
   (7 fields read better than 7 positionals; single internal caller).
4. `plugins/table/.../editable-cell.tsx` — multi-value aware: empty-check from
   `values` when the field is multi, wires `onCommitValues`→`onEditValues`,
   editable when `onEdit || onEditValues`.
5. `plugins/table/.../table-view.tsx` — projects `values`, threads them through.

### New plugins

6. `fields/plugins/tags/plugins/table` — read-only `TagsCell` (muted chips).
   Without it, committed tags render as a perpetual "Empty" hint.
7. `fields/plugins/tags/plugins/inline` — `TagsEditor`: open-by-default
   `InlinePopover` with a free-text add input + a toggle-chip grid (known
   `field.options` ∪ current selection). Accumulates locally; commits the array on
   dismiss via `onCommitValues`, cancels if unchanged or on Esc.

## Tradeoffs

- **Separate channel vs widening**: chose separate (`onEditValues`/`onCommitValues`)
  over widening `FieldValue` to keep all scalar consumers compiling unchanged and to
  mirror the established `value`/`values` precedent.
- **Read cell included**: technically beyond "the editor", but the editor is
  unusable without it (edits would be invisible). Also closes a real pre-existing
  gap — `tags` had no table cell.
- **Free-text add**: makes it a real tags editor (Notion-like) rather than a
  multi-enum; new tags not in `options` display by raw value.
