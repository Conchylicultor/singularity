import { useRef, useState, type ReactNode } from "react";
import type { CellEditorProps } from "@plugins/primitives/plugins/data-view/web";
import { toISODay } from "@plugins/primitives/plugins/date-picker/core";
import { DatePickerPopover } from "@plugins/primitives/plugins/date-picker/web";

/**
 * Project a field value into a `Date`, or `null` when it holds no usable date.
 *
 * Deliberately NOT a string round-trip. The previous editor seeded a native
 * `<input type="date">` from `d.toISOString().slice(0, 10)` (UTC) and committed
 * `new Date(isoDay)` (parsed as UTC midnight) — two independent off-by-one-day
 * bugs west of Greenwich. The value now stays a `Date` end to end, and the only
 * `yyyy-mm-dd` projection left is the trigger's label, through the primitive's
 * local-midnight `toISODay`.
 */
function toDate(v: CellEditorProps["value"]): Date | null {
  const d = v instanceof Date ? v : v ? new Date(v as string | number) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

/**
 * Compact inline date editor: an open-by-default date picker popover. Picking a
 * day commits it and closes; dismissing the popover (Esc / outside press)
 * cancels.
 */
export function DateEditor(props: CellEditorProps): ReactNode {
  const [open, setOpen] = useState(true);
  const selected = toDate(props.value);
  // Latches on the first outcome so a commit is never followed by the
  // dismissal's cancel (nor a second commit).
  const committed = useRef(false);

  function commit(next: Date | null) {
    if (committed.current) return;
    committed.current = true;
    setOpen(false);
    props.onCommit(next);
  }

  return (
    <DatePickerPopover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Dismissed without picking a day ⇒ cancel.
        if (!next && !committed.current) {
          committed.current = true;
          props.onCancel();
        }
      }}
      value={selected}
      onChange={commit}
      // The native input this replaced could be emptied, so keep an explicit
      // "no date" outcome. The panel models it as its own callback rather than
      // an `onChange(null)`, which is why it isn't just a nullable commit.
      onClear={() => commit(null)}
      // A native <button>, not a <span>: the popover trigger merges button
      // behavior into whatever it is given, and base-ui warns (correctly) that a
      // non-button loses the native semantics forms and screen readers rely on.
      trigger={
        <button type="button" className="truncate text-body">
          {selected ? toISODay(selected) : ""}
        </button>
      }
    />
  );
}
