import { useEffect, useState } from "react";

/**
 * The current epoch ms, re-read every `intervalMs` — a presentational ticker
 * for an on-screen clock. It re-renders a DISPLAY of time passing; it is never
 * how a caller learns that something changed (that comes pushed, e.g. from a
 * live-state resource).
 */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** A duration as a clock: `m:ss`, or `h:mm:ss` from an hour up. Negative reads `0:00`. */
export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** A live `m:ss` clock of the time since `since`, ticking every second. */
export function ElapsedTime({
  since,
  className,
}: {
  since: Date;
  className?: string;
}) {
  const now = useNow(1000);
  return (
    <span className={className}>{formatElapsed(now - since.getTime())}</span>
  );
}
