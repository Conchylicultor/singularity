import { useEffect, useState } from "react";

export function formatRelativeTime(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
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

export function RelativeTime({ date, className }: { date: Date; className?: string }) {
  useAutoUpdate(date);
  return (
    <span className={className}>{formatRelativeTime(date)}</span>
  );
}
