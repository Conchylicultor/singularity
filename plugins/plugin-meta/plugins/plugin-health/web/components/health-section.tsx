import { useEffect, useMemo, useState } from "react";
import {
  Section,
  type PluginNode,
} from "@plugins/plugin-meta/plugins/plugin-view/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { formatRelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { pluginHealthReviewsDescriptor } from "../../shared/schemas";
import type { PluginStaleness, ReviewTaskSummary } from "../../core";

interface ReviewWithMeta {
  id: string;
  axis: string;
  commitHash: string;
  createdAt: string;
  staleness?: PluginStaleness;
  tasks: ReviewTaskSummary[];
}

function StatusDot({ color }: { color: string }) {
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${color}`}
    />
  );
}

function healthColor(
  staleness: PluginStaleness | undefined,
  tasks: ReviewTaskSummary[],
): string {
  const openCount = tasks.filter((t) => t.status === "open").length;
  const commits = staleness?.commitsSince ?? 0;

  if (commits > 50 || openCount > 5) return "bg-red-500";
  if (commits > 10 || openCount > 0) return "bg-yellow-500";
  return "bg-green-500";
}

export function HealthSection({ node }: { node: PluginNode }) {
  const reviewsResult = useResource(pluginHealthReviewsDescriptor);
  const reviews = useMemo(
    () => reviewsResult.pending ? [] : reviewsResult.data.filter((r) => r.pluginId === node.hierarchyId),
    [reviewsResult, node.hierarchyId],
  );

  const [enriched, setEnriched] = useState<ReviewWithMeta[]>([]);

  useEffect(() => {
    if (reviews.length === 0) {
      setEnriched([]);
      return;
    }

    let cancelled = false;

    void (async () => {
      const [stalenessRes, ...taskResults] = await Promise.all([
        fetch(
          `/api/plugin-health/staleness/${encodeURIComponent(node.hierarchyId)}`,
        ).then((r) => r.json() as Promise<PluginStaleness[]>),
        ...reviews.map((r) =>
          fetch(`/api/plugin-health/tasks/${encodeURIComponent(r.id)}`).then(
            (res) => res.json() as Promise<ReviewTaskSummary[]>,
          ),
        ),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- set to true in useEffect cleanup
      if (cancelled) return;

      const stalenessMap = new Map(
        (stalenessRes as PluginStaleness[]).map((s) => [s.axis, s]),
      );

      setEnriched(
        reviews.map((r, i) => ({
          id: r.id,
          axis: r.axis,
          commitHash: r.commitHash,
          createdAt: r.createdAt,
          staleness: stalenessMap.get(r.axis),
          tasks: taskResults[i]!,
        })),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [reviews, node.hierarchyId]);

  if (reviews.length === 0) return null;

  return (
    <Section title="Health" count={String(reviews.length)}>
      <div className="overflow-x-auto">
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-left text-muted-foreground/60">
              <th className="pb-1 pr-3 font-medium" />
              <th className="pb-1 pr-3 font-medium">Axis</th>
              <th className="pb-1 pr-3 font-medium">Reviewed</th>
              <th className="pb-1 pr-3 font-medium">Commits</th>
              <th className="pb-1 font-medium">Findings</th>
            </tr>
          </thead>
          <tbody>
            {enriched.map((r) => {
              const open = r.tasks.filter((t) => t.status === "open").length;
              const dropped = r.tasks.filter(
                (t) => t.status === "dropped",
              ).length;
              const held = r.tasks.filter((t) => t.status === "held").length;
              return (
                <tr key={r.id} className="border-t border-border/30">
                  <td className="py-1.5 pr-2">
                    <StatusDot color={healthColor(r.staleness, r.tasks)} />
                  </td>
                  <td className="py-1.5 pr-3 font-medium text-foreground">
                    {r.axis}
                  </td>
                  <td className="py-1.5 pr-3 text-muted-foreground">
                    {formatRelativeTime(new Date(r.createdAt))}
                  </td>
                  <td className="py-1.5 pr-3 text-muted-foreground">
                    {r.staleness?.commitsSince ?? "—"}
                    {r.staleness?.apiChanged && (
                      <span className="ml-1 text-yellow-500" title="API changed">
                        *
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 text-muted-foreground">
                    {r.tasks.length === 0
                      ? "—"
                      : [
                          open > 0 && `${open} open`,
                          dropped > 0 && `${dropped} dropped`,
                          held > 0 && `${held} held`,
                        ]
                          .filter(Boolean)
                          .join(", ") || "all resolved"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
