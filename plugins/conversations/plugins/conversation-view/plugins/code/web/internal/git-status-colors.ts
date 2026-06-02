import type { EditedFileStatus } from "../../core/protocol";

/** Solid dot indicator class per git status. */
const GIT_STATUS_DOT: Record<EditedFileStatus, string> = {
  modified: "bg-info",
  added: "bg-success",
  untracked: "bg-warning",
  deleted: "bg-muted-foreground/40",
  renamed: "bg-categorical-5",
  copied: "bg-categorical-3",
  clean: "bg-muted-foreground/20",
};

/** Bordered chip class per git status (bg + text + border). */
const GIT_STATUS_BADGE: Record<EditedFileStatus, string> = {
  modified: "bg-info/15 text-info border-info/30",
  added: "bg-success/15 text-success border-success/30",
  untracked: "bg-success/15 text-success border-success/30",
  deleted: "bg-destructive/15 text-destructive border-destructive/30",
  renamed: "bg-categorical-5/15 text-categorical-5 border-categorical-5/30",
  copied: "bg-categorical-3/15 text-categorical-3 border-categorical-3/30",
  clean: "bg-muted text-muted-foreground border-border",
};

/**
 * Git-status → class lookups. Statuses cross plugin boundaries as plain strings
 * (e.g. PluginChangedFile.status), so these accept any string and fall back to
 * `modified` for unknown values — keeping the narrowing + fallback in one place.
 */
export function gitStatusDot(status: string): string {
  return GIT_STATUS_DOT[status as EditedFileStatus] ?? GIT_STATUS_DOT.modified;
}

export function gitStatusBadge(status: string): string {
  return GIT_STATUS_BADGE[status as EditedFileStatus] ?? GIT_STATUS_BADGE.modified;
}
