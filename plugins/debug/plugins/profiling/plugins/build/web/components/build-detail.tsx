import { useCallback, useEffect, useState, type ReactElement } from "react";
import {
  GanttSection,
  ProfilingContext,
  SpanDetail,
  groupByPhase,
  type Span,
} from "@plugins/debug/plugins/profiling/web";
import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";
import { PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { BUILD_PHASE_ORDER, BUILD_PHASE_CONFIG } from "../phases";
import { buildProfileDetailPane } from "../panes";

interface BuildData {
  spans: Span[];
  totalMs: number;
}

export function BuildProfileDetailBody(): ReactElement {
  const { worktree, buildId } = buildProfileDetailPane.useParams();
  const [data, setData] = useState<BuildData | null>(null);
  const [hovered, setHovered] = useState<Span | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/debug/profiling/build/${encodeURIComponent(
          worktree,
        )}/${encodeURIComponent(buildId)}`,
      );
      if (!res.ok) {
        setError(true);
        return;
      }
      setData((await res.json()) as BuildData);
    } catch (err) {
      if (err instanceof TypeError) return;
      throw err;
    }
  }, [worktree, buildId]);

  useEffect(() => {
    void load();
  }, [load]);

  const title = `Build · ${worktree.replace(/^claude-web\//, "")}`;

  return (
    <PaneChrome pane={buildProfileDetailPane} title={title}>
      {!data ? (
        <Placeholder tone={error ? "error" : "muted"}>
          {error ? "Build profile unavailable." : "Loading…"}
        </Placeholder>
      ) : data.spans.length === 0 ? (
        <Placeholder tone="muted">
          No profile recorded for this build.
        </Placeholder>
      ) : (
        <ProfilingContext.Provider
          value={{ hovered, setHovered, refreshKey: 0 }}
        >
          <div className="p-2">
            <div className="overflow-hidden rounded border">
              {(() => {
                const grouped = groupByPhase(data.spans);
                return (
                  <GanttSection
                    title="Build"
                    totalMs={data.totalMs}
                    phaseOrder={BUILD_PHASE_ORDER}
                    phaseConfig={BUILD_PHASE_CONFIG}
                    allByPhase={grouped.all}
                    visibleByPhase={grouped.visible}
                  />
                );
              })()}
              <SpanDetail span={hovered} />
            </div>
          </div>
        </ProfilingContext.Provider>
      )}
    </PaneChrome>
  );
}
