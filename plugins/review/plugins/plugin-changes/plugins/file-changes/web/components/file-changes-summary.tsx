import type { PluginReviewProps } from "@plugins/review/plugins/plugin-changes/core";

export function FileChangesSummary({ plugin }: PluginReviewProps) {
  if (plugin.fileCount === 0) return null;
  return (
    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
      {plugin.fileCount}f
      {plugin.additions > 0 && (
        <span className="text-success">
          {" "}+{plugin.additions}
        </span>
      )}
      {plugin.deletions > 0 && (
        <span className="text-destructive"> -{plugin.deletions}</span>
      )}
    </span>
  );
}
