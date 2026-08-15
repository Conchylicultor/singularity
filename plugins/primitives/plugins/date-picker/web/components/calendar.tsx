import { useState } from "react";
import { MdChevronLeft, MdChevronRight } from "react-icons/md";

import {
  addMonths,
  buildMonthGrid,
  isSameDay,
  isSameMonth,
  monthTitle,
  startOfDay,
  startOfMonth,
  toISODay,
  weekdayLabels,
} from "../../core";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Grid } from "@plugins/primitives/plugins/css/plugins/grid/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  Button,
  ControlSizeProvider,
  cn,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";

export interface CalendarProps {
  /**
   * The selected day. Compared by LOCAL calendar day, so any time-of-day works
   * — the panel's time field owns the clock part.
   */
  value?: Date | null;
  /** Fired with LOCAL midnight of the clicked day. */
  onSelect?: (day: Date) => void;
  /**
   * The displayed month (any day within it). Pass with `onMonthChange` for a
   * controlled pager; omit both and the calendar keeps its own month, seeded
   * from `value` (or today).
   */
  month?: Date;
  onMonthChange?: (month: Date) => void;
  /** First grid column's weekday, 0 = Sunday (the default). */
  weekStartsOn?: number;
  /** Inclusive selectable bounds, day-granular. Days outside are disabled. */
  min?: Date;
  max?: Date;
  /** BCP-47 locale for the month title + weekday row. Defaults to the runtime's. */
  locale?: string;
  className?: string;
}

/**
 * The bare month grid: a prev/next header plus 6×7 day cells.
 *
 * Exported separately from `DatePickerPanel` because two of the three consumers
 * want ONLY this — the date-filter's "Exact date" section has its own relative
 * presets above it (which a calendar cannot express) and no time concept, so it
 * seeds from a `yyyy-mm-dd` string and takes the picked day, nothing more.
 *
 * Hand-rolled on the layout primitives rather than vendoring a `Calendar`: the
 * shape IS `Grid cols={7}`, and `Button` + `ControlSizeProvider` give day cells
 * that follow the active theme's radius/density tokens for free.
 */
export function Calendar({
  value,
  onSelect,
  month,
  onMonthChange,
  weekStartsOn = 0,
  min,
  max,
  locale,
  className,
}: CalendarProps) {
  const today = startOfDay(new Date());
  const [ownMonth, setOwnMonth] = useState(() =>
    startOfMonth(value ?? new Date()),
  );

  // Controlled iff `month` is supplied; the internal state is then inert rather
  // than a second source of truth that can drift from the prop.
  const isControlled = month !== undefined;
  const viewMonth = month ?? ownMonth;

  function goToMonth(next: Date) {
    if (!isControlled) setOwnMonth(startOfMonth(next));
    onMonthChange?.(startOfMonth(next));
  }

  function pick(day: Date) {
    // Clicking a leading/trailing cell pages to that day's month, so the
    // selection is never left off-screen.
    if (!isSameMonth(day, viewMonth)) goToMonth(day);
    onSelect?.(day);
  }

  const lowerBound = min === undefined ? undefined : startOfDay(min).getTime();
  const upperBound = max === undefined ? undefined : startOfDay(max).getTime();

  const weeks = buildMonthGrid(viewMonth, weekStartsOn);
  const headings = weekdayLabels(weekStartsOn, locale);

  return (
    <Stack gap="xs" className={className}>
      <Line>
        <IconButton
          icon={MdChevronLeft}
          label="Previous month"
          onClick={() => goToMonth(addMonths(viewMonth, -1))}
        />
        <Fill>
          <Center axis="horizontal">
            <Text variant="label">{monthTitle(viewMonth, locale)}</Text>
          </Center>
        </Fill>
        <IconButton
          icon={MdChevronRight}
          label="Next month"
          onClick={() => goToMonth(addMonths(viewMonth, 1))}
        />
      </Line>

      <ControlSizeProvider size="sm">
        <Grid cols={7} gap="none">
          {headings.map((label, i) => (
            <Center key={`${String(i)}-${label}`}>
              <Text variant="caption" tone="muted">
                {label}
              </Text>
            </Center>
          ))}
        </Grid>

        {/* No `role="grid"`: a grid promises `row` children, and these day cells
            are a flat 7-column CSS grid with none. Claiming it would make AT
            announce an empty grid and drop the day buttons — worse than the
            plain buttons, which each announce their own label and pressed state.
            (aria-safety/no-orphan-composite-role) */}
        <Grid cols={7} gap="none">
          {weeks.flat().map((day) => {
            const selected = value != null && isSameDay(day, value);
            const time = day.getTime();
            const disabled =
              (lowerBound !== undefined && time < lowerBound) ||
              (upperBound !== undefined && time > upperBound);

            return (
              <Center key={toISODay(day)}>
                <Button
                  aspect="icon"
                  shape="pill"
                  variant={selected ? "default" : "ghost"}
                  disabled={disabled}
                  aria-pressed={selected}
                  onClick={() => pick(day)}
                  className={cn(
                    !isSameMonth(day, viewMonth) && "text-muted-foreground/60",
                    // Today reads as a ring so it survives the selected fill
                    // being applied to a different cell.
                    isSameDay(day, today) && !selected && "ring-1 ring-primary",
                  )}
                >
                  {day.getDate()}
                </Button>
              </Center>
            );
          })}
        </Grid>
      </ControlSizeProvider>
    </Stack>
  );
}
