import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { usePluginFacetDiffs } from "@plugins/review/plugins/plugin-changes/web";
import type { PluginReviewProps } from "@plugins/review/plugins/plugin-changes/core";

export function ApiChangesSummary({ plugin }: PluginReviewProps) {
  const facetDiffs = usePluginFacetDiffs(plugin);
  const count = facetDiffs.reduce(
    (sum, fd) => sum + fd.diff.added.length + fd.diff.removed.length,
    0,
  );
  if (count === 0) return null;
  return (
    <Badge colorClass="bg-categorical-5/15 text-categorical-5" className="font-semibold">
      {count} API
    </Badge>
  );
}
