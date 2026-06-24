import { useEffect, useState } from "react";
import {
  Section,
  type PluginNode,
} from "@plugins/plugin-meta/plugins/plugin-view/web";
import { useResource, ResourceView } from "@plugins/primitives/plugins/live-state/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { getPluginStaleness, getPluginHealthTasks } from "../../core/endpoints";
import { pluginHealthReviewsDescriptor } from "../../shared/schemas";
import type { PluginHealthReview, PluginStaleness, ReviewTaskSummary } from "../../core";

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

  if (commits > 50 || openCount > 5) return "bg-destructive";
  if (commits > 10 || openCount > 0) return "bg-warning";
  return "bg-success";
}

function HealthSectionInner({
  reviews,
  node,
}: {
  reviews: PluginHealthReview[];
  node: PluginNode;
}) {
  const pluginReviews = reviews.filter((r) => r.pluginId === node.id);

  const [enriched, setEnriched] = useState<ReviewWithMeta[]>([]);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- async fetch+merge on live-state node.id/reviews change: setEnriched is driven by parallel staleness + per-review task reads; the cancelled-flag guards unmount/stale writes. No deriving-in-render path exists (the data is fetched, not pushed), and a single useResource cannot express the per-review Promise.all fan-out. */
    if (pluginReviews.length === 0) {
      setEnriched([]);
      return;
    }

    let cancelled = false;

    void (async () => {
      const [stalenessRes, ...taskResults] = await Promise.all([
        // eslint-disable-next-line reactive-server-io/no-reactive-server-io -- read-only per-tab view refresh on live-state change; each tab renders its own enriched view, no cross-tab write to deduplicate
        fetchEndpoint(getPluginStaleness, { pluginId: node.id }),
        ...pluginReviews.map((r) =>
          // eslint-disable-next-line reactive-server-io/no-reactive-server-io -- read-only per-tab view refresh on live-state change; each tab renders its own enriched view, no cross-tab write to deduplicate
          fetchEndpoint(getPluginHealthTasks, { reviewId: r.id }),
        ),
      ]);

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- set to true in useEffect cleanup
      if (cancelled) return;

      const stalenessMap = new Map(
        stalenessRes.map((s) => [s.axis, s]),
      );

      setEnriched(
        pluginReviews.map((r, i) => ({
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
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pluginReviews is derived inline; use stable node.id as the key
  }, [node.id, reviews]);

  if (pluginReviews.length === 0) return null;

  return (
    <Section title="Health" count={String(pluginReviews.length)}>
      <Scroll axis="x">
        <table className="w-full text-2xs">
          <thead>
            <tr className="text-left text-muted-foreground/60">
              <th className="pb-xs pr-md font-medium" />
              <th className="pb-xs pr-md font-medium">Axis</th>
              <th className="pb-xs pr-md font-medium">Reviewed</th>
              <th className="pb-xs pr-md font-medium">Commits</th>
              <th className="pb-xs font-medium">Findings</th>
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
                  <td className="py-xs pr-sm">
                    <StatusDot color={healthColor(r.staleness, r.tasks)} />
                  </td>
                  <td className="py-xs pr-md font-medium text-foreground">
                    {r.axis}
                  </td>
                  <td className="py-xs pr-md text-muted-foreground">
                    <RelativeTime date={new Date(r.createdAt)} />
                  </td>
                  <td className="py-xs pr-md text-muted-foreground">
                    {r.staleness?.commitsSince ?? "—"}
                    {r.staleness?.apiChanged && (
                      // eslint-disable-next-line spacing/no-adhoc-spacing -- ml-1 is a tiny inline offset for the trailing "API changed" asterisk after the commit count, not container rhythm
                      <span className="ml-1 text-warning" title="API changed">
                        *
                      </span>
                    )}
                  </td>
                  <td className="py-xs text-muted-foreground">
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
      </Scroll>
    </Section>
  );
}

export function HealthSection({ node }: { node: PluginNode }) {
  const reviewsResult = useResource(pluginHealthReviewsDescriptor);
  return (
    <ResourceView resource={reviewsResult}>
      {(reviews) => <HealthSectionInner reviews={reviews} node={node} />}
    </ResourceView>
  );
}
