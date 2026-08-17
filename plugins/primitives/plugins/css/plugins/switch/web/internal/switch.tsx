import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { ReactElement } from "react";

export interface SwitchIndicatorProps {
  /** Whether the switch reads on (knob right, track filled) or off. */
  checked: boolean;
  /** Dims the indicator. Purely visual — the CONTROL owns the disabled behavior. */
  disabled?: boolean;
  /** Extra classes for layout — e.g. an alignment nudge next to adjacent text. */
  className?: string;
}

/**
 * The switch VISUAL — a track with a knob, and nothing else. A `<span>` with no
 * handler, no `role`, no `tabIndex`.
 *
 * That is deliberate, and it is what makes the trailing cell of a control-panel
 * row safe: the row IS already the click target, so a switch dropped into it can
 * never nest a `<button>` inside a `<button>` (invalid DOM whose failure is
 * silent — the inner click is swallowed or falls through). Anything that is
 * already interactive renders this; anything that is not renders `Switch` below.
 *
 * One fixed size (28×16 track, 12 knob), mirroring `selection-indicator`'s single
 * `size-3` box: a switch that comes in sizes is a switch that will disagree with
 * the checkbox beside it.
 */
export function SwitchIndicator({
  checked,
  disabled,
  className,
}: SwitchIndicatorProps): ReactElement {
  return (
    <span
      aria-hidden
      data-state={checked ? "checked" : "unchecked"}
      className={cn(
        "relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors",
        checked ? "bg-primary" : "bg-input dark:bg-input/80",
        disabled && "opacity-50",
        className,
      )}
    >
      <span
        className={cn(
          // Translated, not laid out: the knob keeps ONE position rule, so the
          // travel distance is `track - knob - 2×inset` in one place instead of
          // a padding on the track that a flex direction could reinterpret.
          "absolute top-0.5 left-0.5 size-3 rounded-full shadow-sm transition-transform",
          checked ? "translate-x-3 bg-primary-foreground" : "bg-background",
        )}
      />
    </span>
  );
}

export interface SwitchProps extends SwitchIndicatorProps {
  /** Fired with the NEXT state. */
  onCheckedChange: (checked: boolean) => void;
  /** Accessible name, when no visible label is associated. */
  "aria-label"?: string;
  /** Id of the visible label naming this switch. */
  "aria-labelledby"?: string;
  id?: string;
  ref?: React.Ref<HTMLButtonElement>;
}

/**
 * The standalone switch — `SwitchIndicator` inside its own `role="switch"`
 * button, for use OUTSIDE an already-interactive host (a settings form row, a
 * toolbar). Inside a control-panel row, pass `select="switch"` instead: the row
 * is the control, and this button would be the nested one.
 */
export function Switch({
  checked,
  onCheckedChange,
  disabled,
  className,
  id,
  ref,
  ...aria
}: SwitchProps): ReactElement {
  return (
    <button
      ref={ref}
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "focus-ring inline-flex rounded-full disabled:pointer-events-none",
        className,
      )}
      {...aria}
    >
      <SwitchIndicator checked={checked} disabled={disabled} />
    </button>
  );
}
