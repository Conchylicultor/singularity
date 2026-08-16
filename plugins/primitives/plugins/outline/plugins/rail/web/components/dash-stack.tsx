import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import {
  insetClass,
  Stack,
} from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { OutlineEntry } from "../../core";
import { dashWindow } from "../internal/dash-window";
import { DASH_WIDTH, DASH_WIDTH_ACTIVE, depthStep } from "../internal/depth";

export interface DashStackProps {
  entries: OutlineEntry[];
  activeId: string | null;
  /** Index the window centers on — 0 when nothing is active yet. */
  activeIndex: number;
  /** How many dashes fit in the rail's own height. */
  capacity: number;
  onJump: (id: string) => void;
}

/**
 * The rail at rest: one dash per entry, width by depth, the current one bright
 * and a step wider.
 *
 * `aria-hidden` and unreachable by Tab on purpose. These dashes mirror the
 * expanded panel's rows one-for-one, so exposing both would read the whole
 * outline twice to a screen reader and cost a Tab stop per section. The panel
 * rows are the accessible outline; the dashes are the pointer affordance and the
 * indicator. The rail as a whole is still Tab-reachable — `FloatingAction`'s own
 * wrapper takes focus and opens the panel.
 *
 * `data-outline-dash` / `data-outline-id` / `data-active` are the SUPPORTED
 * addressing contract for cross-plugin e2e scripts (see the rail's CLAUDE.md).
 * Because the stack is `aria-hidden`, `data-active` is the only marker a test
 * can read here — do not swap it for a class.
 */
export function DashStack({
  entries,
  activeId,
  activeIndex,
  capacity,
  onJump,
}: DashStackProps) {
  const view = dashWindow(entries.length, capacity, activeIndex);
  const last = view.end - view.start - 1;

  return (
    <Stack
      direction="col"
      gap="none"
      aria-hidden
      className={cn("w-full", insetClass({ x: "xs", y: "xs" }))}
    >
      {entries.slice(view.start, view.end).map((entry, i) => {
        const active = entry.id === activeId;
        const step = depthStep(entry.depth);
        // Only fade an edge dash when something is genuinely hidden past it —
        // a faded edge that hides nothing is a lie about the document's length.
        const fading =
          (i === 0 && view.moreAbove) || (i === last && view.moreBelow);
        return (
          // Full-width so the hit area is the whole rail strip, not the 8–20px
          // bar; the empty Fill pushes the bar flush right.
          <Line
            key={entry.id}
            as="button"
            type="button"
            tabIndex={-1}
            data-outline-dash=""
            data-outline-id={entry.id}
            data-active={active ? "true" : "false"}
            className="h-2 w-full"
            onClick={() => onJump(entry.id)}
          >
            <Fill />
            <span
              className={cn(
                "h-0.5 rounded-full transition-[width,background-color] duration-150",
                active ? DASH_WIDTH_ACTIVE[step] : DASH_WIDTH[step],
                active ? "bg-foreground" : "bg-muted-foreground/40",
                fading && "opacity-50",
              )}
            />
          </Line>
        );
      })}
    </Stack>
  );
}
