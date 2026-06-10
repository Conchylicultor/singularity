import { MdAdd, MdRemove } from "react-icons/md";
import {
  usePluginFacetDiffs,
  type FacetDiff,
} from "@plugins/review/plugins/plugin-changes/web";
import type { PluginReviewProps } from "@plugins/review/plugins/plugin-changes/core";
import { Text } from "@plugins/primitives/plugins/text/web";

function DiffSection({ label, diff }: { label: string; diff: FacetDiff["diff"] }) {
  return (
    <div className="flex flex-col gap-0.5">
      <Text as="span" variant="caption" className="font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </Text>
      {diff.added.map((item) => (
        <Text as="span" variant="caption" key={item} className="flex items-center gap-1.5">
          <MdAdd className="size-3 text-success shrink-0" />
          <code className="text-success">{item}</code>
        </Text>
      ))}
      {diff.removed.map((item) => (
        <Text as="span" variant="caption" key={item} className="flex items-center gap-1.5">
          <MdRemove className="size-3 text-destructive shrink-0" />
          <code className="text-destructive">{item}</code>
        </Text>
      ))}
    </div>
  );
}

export function ApiChangesSection({ plugin }: PluginReviewProps) {
  const facetDiffs = usePluginFacetDiffs(plugin);
  if (facetDiffs.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      {facetDiffs.map((fd) => (
        <DiffSection key={fd.facetId} label={fd.label} diff={fd.diff} />
      ))}
    </div>
  );
}
