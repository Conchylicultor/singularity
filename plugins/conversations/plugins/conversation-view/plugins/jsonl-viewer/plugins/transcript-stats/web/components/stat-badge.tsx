import type { ReactNode } from "react";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";

/** How loud a stat is. `attention` / `alert` change the ink, never the plate. */
export type StatTone = "muted" | "attention" | "alert";

// One translucent plate for every stat, so the strip reads as one row of
// readings rather than a pile of differently-styled chips. Tone is the only
// axis a contribution gets, and it moves the ink alone — a status strip that
// starts painting filled colour blocks over the transcript is exactly the
// noise this strip exists to avoid.
const PLATE = "bg-background/80 backdrop-blur-sm";
const INK: Record<StatTone, string> = {
  muted: "text-muted-foreground/60",
  attention: "text-warning",
  alert: "text-destructive",
};

export function StatBadge({
  tone = "muted",
  title,
  children,
}: {
  tone?: StatTone;
  /** Hover detail: the exact figures behind the rounded ones. */
  title?: string;
  children: ReactNode;
}) {
  return (
    <Badge
      colorClass={`${PLATE} ${INK[tone]}`}
      className="pointer-events-auto"
      title={title}
    >
      {children}
    </Badge>
  );
}
