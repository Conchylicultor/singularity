// Shared, locale-aware formatting for date/reminder mentions. The token stores a
// UTC ISO instant; these render it in the viewer's local time. Year is dropped
// when it matches the current year to keep inline chips compact.

function sameYear(d: Date): boolean {
  return d.getFullYear() === new Date().getFullYear();
}

/** Compact day label, e.g. "Wed, Jun 17" (current year) or "Jun 17, 2027". */
export function formatDay(date: Date): string {
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(sameYear(date) ? {} : { year: "numeric" }),
  });
}

/** Time-of-day label, e.g. "9:00 AM". */
export function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

/** Chip / option label: day for a date, day + time for a reminder. */
export function formatMention(date: Date, isReminder: boolean): string {
  return isReminder ? `${formatDay(date)} · ${formatTime(date)}` : formatDay(date);
}
