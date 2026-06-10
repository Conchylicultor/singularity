import { Text } from "@plugins/primitives/plugins/text/web";
import type { PluginReviewProps } from "@plugins/review/plugins/plugin-changes/core";

export function FileChangesSummary({ plugin }: PluginReviewProps) {
  if (plugin.fileCount === 0) return null;
  return (
    <Text as="span" variant="caption" className="shrink-0 text-muted-foreground tabular-nums">
      {plugin.fileCount}f
      {plugin.additions > 0 && (
        <span className="text-success">
          {" "}+{plugin.additions}
        </span>
      )}
      {plugin.deletions > 0 && (
        <span className="text-destructive"> -{plugin.deletions}</span>
      )}
    </Text>
  );
}
