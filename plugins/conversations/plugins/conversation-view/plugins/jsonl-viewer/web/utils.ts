import type { TokenUsage } from "../shared";

export function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function formatTokenCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0";
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

export function tokenUsageTooltip(u: TokenUsage): string {
  return [
    `Input: ${u.input.toLocaleString()}`,
    `Output: ${u.output.toLocaleString()}`,
    `Cache read: ${u.cacheRead.toLocaleString()}`,
    `Cache creation: ${u.cacheCreation.toLocaleString()}`,
    `Context: ${(u.input + u.cacheRead + u.cacheCreation).toLocaleString()}`,
  ].join("\n");
}
