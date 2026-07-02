const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** Human-readable byte size, e.g. 2048 → "2 KB", 1_500_000 → "1.4 MB". */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const exp = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    UNITS.length - 1,
  );
  const value = bytes / 1024 ** exp;
  // Whole numbers for bytes; one decimal for KB+ (trimmed of a trailing .0).
  const text = exp === 0 ? String(Math.round(value)) : value.toFixed(1);
  return `${text.replace(/\.0$/, "")} ${UNITS[exp]}`;
}
