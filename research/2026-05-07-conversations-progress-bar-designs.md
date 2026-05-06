# Progress Bar Designs

Two visual designs for the 4-phase conversation progress indicator. Both are drop-in renderers — same color logic, same phase data model, different shape.

---

## Shared foundation

### Phase data model

```ts
// plugins/conversations/plugins/conversation-progress/shared/schemas.ts

export const PHASE_ORDER = [
  "research",
  "design",
  "implementation",
  "pushed",
] as const;
export type ConversationPhase = (typeof PHASE_ORDER)[number];

export const PHASE_LABELS: Record<ConversationPhase, string> = {
  research: "Research",
  design: "Design",
  implementation: "Implementation",
  pushed: "Pushed",
};
```

### Color logic (identical in both designs)

Given `currentIndex = PHASE_ORDER.indexOf(phase)`, for each segment at index `i`:

| State | Condition | Tailwind class |
|---|---|---|
| Past | `i < currentIndex` | `bg-emerald-500/70` |
| Active | `i === currentIndex` | `bg-primary` |
| Future | `i > currentIndex` | `bg-muted-foreground/25` (bar) or `border border-muted-foreground/40` (dots) |

### Tooltip infrastructure

Both designs use the shadcn/ui Tooltip (Radix UI v2 render-prop API):

```tsx
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
```

`TooltipTrigger` uses the `render` prop (not `asChild`) to nominate the trigger element:

```tsx
<TooltipTrigger render={<span className="..." />}>
  {children}
</TooltipTrigger>
```

---

## Design 1 — Dots

**File:** `plugins/conversations/plugins/conversation-progress/web/components/progress-dots.tsx`

### Visual

Non-compact (toolbar):
```
● ── ● ── ○ ── ○   Implementation
```
Compact:
```
● ● ○ ○
```

- Each dot is `size-2 rounded-full` (8×8 px circle).
- Non-compact: horizontal connector lines (`h-px w-3`) between dots, phase label at the end.
- Compact: tighter `gap-0.5`, no connectors, no label. Each dot has its own individual tooltip.
- Non-compact: one tooltip per dot.

### Full component code

```tsx
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PHASE_ORDER, PHASE_LABELS, type ConversationPhase } from "../../shared/schemas";

interface ProgressDotsProps {
  phase: ConversationPhase;
  compact?: boolean;
}

export function ProgressDots({ phase, compact = false }: ProgressDotsProps) {
  const currentIndex = PHASE_ORDER.indexOf(phase);

  const dots = PHASE_ORDER.map((p, i) => {
    const isPast = i < currentIndex;
    const isActive = i === currentIndex;

    let dotClass = "size-2 rounded-full shrink-0 ";
    if (isPast) dotClass += "bg-emerald-500/70";
    else if (isActive) dotClass += "bg-primary";
    else dotClass += "border border-muted-foreground/40";

    return { p, i, isPast, isActive, dotClass };
  });

  if (compact) {
    return (
      <span className="inline-flex items-center gap-0.5">
        {dots.map(({ p, dotClass }) => (
          <Tooltip key={p}>
            <TooltipTrigger render={<span className={dotClass} />} />
            <TooltipContent>{PHASE_LABELS[p]}</TooltipContent>
          </Tooltip>
        ))}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      {dots.map(({ p, i, dotClass }) => (
        <span key={p} className="inline-flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger render={<span className={dotClass} />} />
            <TooltipContent>{PHASE_LABELS[p]}</TooltipContent>
          </Tooltip>
          {i < PHASE_ORDER.length - 1 && (
            <span className="h-px w-3 shrink-0 bg-muted-foreground/30" />
          )}
        </span>
      ))}
      <span className="ml-0.5 text-xs text-muted-foreground">
        {PHASE_LABELS[phase]}
      </span>
    </span>
  );
}
```

---

## Design 2 — Segmented bar

**File:** `plugins/conversations/plugins/conversation-progress/web/components/segmented-progress-bar.tsx`

### Visual

```
[▬▬][▬▬][  ][  ]
```

- 40px wide (`w-10`), 4px tall (`h-1`).
- 4 equal flex segments separated by 1px gaps (`gap-px`).
- Segments are `rounded-sm` pills.
- Single tooltip on the whole bar: `"Implementation — 3/4"`.

### Full component code

```tsx
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PHASE_ORDER, PHASE_LABELS, type ConversationPhase } from "../../shared/schemas";

interface SegmentedProgressBarProps {
  phase: ConversationPhase;
}

export function SegmentedProgressBar({ phase }: SegmentedProgressBarProps) {
  const currentIndex = PHASE_ORDER.indexOf(phase);
  const label = `${PHASE_LABELS[phase]} — ${currentIndex + 1}/4`;

  return (
    <Tooltip>
      <TooltipTrigger render={<span className="inline-flex items-center gap-px w-10 cursor-default" />}>
        {PHASE_ORDER.map((p, i) => {
          const segClass =
            i < currentIndex
              ? "bg-emerald-500/70"
              : i === currentIndex
                ? "bg-primary"
                : "bg-muted-foreground/25";
          return <span key={p} className={`h-1 flex-1 rounded-sm ${segClass}`} />;
        })}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
```

---

## Differences at a glance

| | Dots | Segmented bar |
|---|---|---|
| Shape | 8px circles | 4px flat pills |
| Width | ~60px (non-compact) / ~20px (compact) | 40px fixed |
| Connectors | Lines between dots (non-compact) | Gap between segments |
| Tooltip scope | Per-dot (each phase name) | Whole bar (`"Phase — N/4"`) |
| Future style | Outlined circle (`border`) | Filled muted (`/25` opacity) |
| Label | Inline text at the end (non-compact only) | Tooltip only |
