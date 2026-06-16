import { useRef, useState, type ReactNode } from "react";
import type { CellEditorProps } from "@plugins/primitives/plugins/data-view/web";

// Shared native-control chrome (matches the date filter's inputs and the Input
// primitive's border/bg/radius — native inputs are exempt from no-adhoc-control).
const NATIVE_CONTROL =
  "rounded-md border border-input bg-background px-xs py-2xs text-body";

/** Project a field value into an ISO calendar-day string (YYYY-MM-DD) or "". */
function toISODay(v: CellEditorProps["value"]): string {
  const d = v instanceof Date ? v : v ? new Date(v as string | number) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString().slice(0, 10) : "";
}

/** Compact inline date editor: commits on Enter/blur, cancels on Esc. */
export function DateEditor(props: CellEditorProps): ReactNode {
  const [local, setLocal] = useState(toISODay(props.value));
  const committed = useRef(false);

  function commit() {
    if (committed.current) return;
    committed.current = true;
    props.onCommit(local ? new Date(local) : null);
  }

  return (
    <input
      type="date"
      autoFocus
      className={`${NATIVE_CONTROL} h-6`}
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          committed.current = true;
          props.onCancel();
        }
      }}
    />
  );
}
