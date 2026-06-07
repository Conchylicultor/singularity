import { MdAdd, MdRemove } from "react-icons/md";
import {
  usePluginFacetDiffs,
  type FacetDiff,
} from "@plugins/review/plugins/plugin-changes/web";
import type { PluginReviewProps } from "@plugins/review/plugins/plugin-changes/core";

function DiffSection({ label, diff }: { label: string; diff: FacetDiff["diff"] }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      {diff.added.map((item) => (
        <span key={item} className="flex items-center gap-1.5 text-xs">
          <MdAdd className="size-3 text-success shrink-0" />
          <code className="text-success">{item}</code>
        </span>
      ))}
      {diff.removed.map((item) => (
        <span key={item} className="flex items-center gap-1.5 text-xs">
          <MdRemove className="size-3 text-destructive shrink-0" />
          <code className="text-destructive">{item}</code>
        </span>
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
