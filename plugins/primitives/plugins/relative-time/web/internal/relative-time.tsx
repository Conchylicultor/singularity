import { useEffect, useState } from "react";

/**
 * How a relative time is spelled:
 * - `"ago"` (default) — "just now", "11m ago", "3h ago", "2d ago".
 * - `"short"` — "now", "11m", "3h", "2d": the dense-list spelling, for a
 *   trailing column where "ago" is implied by the position.
 */
export type RelativeTimeFormat = "ago" | "short";

export function formatRelativeTime(
  date: Date,
  format: RelativeTimeFormat = "ago",
): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return format === "short" ? "now" : "just now";
  const suffix = format === "short" ? "" : " ago";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m${suffix}`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h${suffix}`;
  const days = Math.floor(hours / 24);
  return `${days}d${suffix}`;
}

function useAutoUpdate(date: Date) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const ageSeconds = Math.floor((Date.now() - date.getTime()) / 1000);
    let intervalMs: number;
    if (ageSeconds < 60) intervalMs = 10_000;
    else if (ageSeconds < 3600) intervalMs = 30_000;
    else intervalMs = 60_000;
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    return () => clearInterval(id);
  }, [date]);
}

export function RelativeTime({
  date,
  className,
  format,
}: {
  date: Date;
  className?: string;
  /** Spelling of the time; defaults to `"ago"`. See {@link RelativeTimeFormat}. */
  format?: RelativeTimeFormat;
}) {
  useAutoUpdate(date);
  return <span className={className}>{formatRelativeTime(date, format)}</span>;
}
