import type { ReactElement } from "react";

export interface DragState {
  start: number;
  current: number;
}

export function DragSelection({
  drag,
}: {
  drag: DragState | null;
}): ReactElement | null {
  if (!drag) return null;

  const left = Math.min(drag.start, drag.current) * 100;
  const width = Math.abs(drag.current - drag.start) * 100;

  return (
    <div
      className="pointer-events-none absolute inset-y-0"
      style={{ left: "10rem", right: "4rem" }}
    >
      <div
        className="absolute inset-y-0 border-x border-blue-400/60 bg-blue-500/15"
        style={{ left: `${left}%`, width: `${width}%` }}
      />
    </div>
  );
}
