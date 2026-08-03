import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";

/**
 * Shared native-control chrome — border/bg/radius matching the `Input`
 * primitive. Native form controls are the documented exemption from
 * `no-adhoc-control` (which fingerprints styled `<button>`/`<a>`), and this is
 * the same recipe `fields/date/plugins/filter`'s value inputs use. A native
 * `<input type="time">` is deliberately kept over a hand-rolled hour/minute
 * pair: it brings the platform's own 12h/24h locale handling, keyboard
 * stepping, and mobile time wheel, none of which are worth re-deriving.
 */
const NATIVE_CONTROL =
  "rounded-md border border-input bg-background px-xs py-2xs text-body";

export interface TimeFieldProps {
  /** `HH:mm` in 24h form (the native control's value grammar). `""` = unset. */
  value: string;
  /** Fired with the raw `HH:mm` string, or `""` when the field is cleared. */
  onChange: (value: string) => void;
  /** Accessible name. Defaults to "Time". */
  label?: string;
  className?: string;
}

/** The clock half of a date-time value — a themed native `<input type="time">`. */
export function TimeField({
  value,
  onChange,
  label = "Time",
  className,
}: TimeFieldProps) {
  return (
    <input
      type="time"
      aria-label={label}
      className={cn(NATIVE_CONTROL, className)}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
