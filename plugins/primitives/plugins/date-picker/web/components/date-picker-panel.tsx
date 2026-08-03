import { useState } from "react";
import { MdClose } from "react-icons/md";

import {
  addDays,
  relativeDayLabel,
  startOfDay,
  startOfMonth,
  type RelativeDayLabel,
} from "../../core";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import {
  Button,
  ControlSizeProvider,
  Separator,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Calendar } from "./calendar";
import { TimeField } from "./time-field";

/** Day offsets of the quick presets, in the order they are shown. */
const PRESET_OFFSETS = [0, 1, -1];

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** A `Date`'s clock part as the native time input's `HH:mm` grammar. */
function toTimeValue(d: Date): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** `day`'s calendar date carrying `source`'s clock. */
function withClockOf(day: Date, source: Date): Date {
  const out = startOfDay(day);
  out.setHours(source.getHours(), source.getMinutes(), 0, 0);
  return out;
}

/**
 * `day` at the `HH:mm` the native control emitted, or `null` when the field was
 * cleared (the native input emits `""` for an empty value, and a half-typed
 * "1:" — there is no partial time to apply).
 */
function withTimeValue(day: Date, time: string): Date | null {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (match === null) return null;
  const out = startOfDay(day);
  out.setHours(Number(match[1]), Number(match[2]), 0, 0);
  return out;
}

export interface DatePickerPanelProps {
  /** The current value, or `null`/`undefined` for "nothing picked yet". */
  value?: Date | null;
  /**
   * Fired with the new value. Picking a day preserves the existing clock (so
   * re-picking a date on a reminder doesn't silently reset it to midnight).
   */
  onChange: (value: Date) => void;
  /** Show the time field below the calendar. Defaults to `false` (date only). */
  withTime?: boolean;
  /** Show the Today / Tomorrow / Yesterday quick row. Defaults to `true`. */
  presets?: boolean;
  /**
   * When supplied, a Clear action is rendered. Clearing is a distinct outcome
   * from picking, so it is its own callback rather than an `onChange(null)`
   * every consumer would have to remember to handle.
   */
  onClear?: () => void;
  /** First grid column's weekday, 0 = Sunday (the default). */
  weekStartsOn?: number;
  /** Inclusive selectable bounds, day-granular. */
  min?: Date;
  max?: Date;
  /** BCP-47 locale for the month title + weekday row. */
  locale?: string;
  className?: string;
}

/**
 * The whole picker: quick presets + month grid + optional time + Clear.
 *
 * The month is controlled HERE rather than left to `Calendar`'s own state, so
 * that a preset press (or an externally-changed `value`) moves the visible
 * month with it instead of leaving the new selection off-screen.
 */
export function DatePickerPanel({
  value,
  onChange,
  withTime = false,
  presets = true,
  onClear,
  weekStartsOn = 0,
  min,
  max,
  locale,
  className,
}: DatePickerPanelProps) {
  const now = new Date();
  const today = startOfDay(now);

  const [month, setMonth] = useState(() => startOfMonth(value ?? now));

  function commit(day: Date) {
    setMonth(startOfMonth(day));
    onChange(value == null ? startOfDay(day) : withClockOf(day, value));
  }

  // Labels come from `relativeDayLabel` — the same function the `@` date menu
  // labels its rows with — so the two surfaces can never disagree about what
  // "Tomorrow" means. Entries whose label doesn't resolve are dropped rather
  // than papered over with a fallback string; by construction none are.
  const presetItems = PRESET_OFFSETS.map((offset) => {
    const day = addDays(today, offset);
    return { day, label: relativeDayLabel(day, now) };
  }).filter((p): p is { day: Date; label: RelativeDayLabel } => p.label !== null);

  const timeValue = value == null ? "" : toTimeValue(value);

  return (
    <Stack gap="sm" className={className}>
      {presets && presetItems.length > 0 ? (
        <ControlSizeProvider size="sm">
          <Cluster gap="xs">
            {presetItems.map((preset) => (
              <Button
                key={preset.label}
                variant="outline"
                onClick={() => commit(preset.day)}
              >
                {preset.label}
              </Button>
            ))}
          </Cluster>
        </ControlSizeProvider>
      ) : null}

      <Calendar
        value={value}
        onSelect={commit}
        month={month}
        onMonthChange={setMonth}
        weekStartsOn={weekStartsOn}
        min={min}
        max={max}
        locale={locale}
      />

      {withTime || onClear ? (
        <>
          <Separator />
          <ControlSizeProvider size="sm">
            <Line>
              {withTime ? (
                <TimeField
                  value={timeValue}
                  onChange={(time) => {
                    // No value yet → the time lands on today, so the control is
                    // never a dead input.
                    const next = withTimeValue(value ?? today, time);
                    if (next !== null) onChange(next);
                  }}
                />
              ) : null}
              <Fill />
              {onClear ? (
                <Button variant="ghost" onClick={onClear}>
                  <MdClose />
                  Clear
                </Button>
              ) : null}
            </Line>
          </ControlSizeProvider>
        </>
      ) : null}
    </Stack>
  );
}
