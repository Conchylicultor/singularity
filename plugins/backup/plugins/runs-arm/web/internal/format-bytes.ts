/**
 * A byte count as something a person reads at a glance.
 *
 * A local copy, like the two others in the repo (the backup panel's own
 * `formatSize`, and mail/attachments' plugin-private `formatBytes`). A shared
 * primitive would retire all three; that is its own change, and this one does
 * not pretend to be it.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
