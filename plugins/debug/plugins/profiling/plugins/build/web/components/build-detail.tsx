import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import {
  GanttSection,
  ProfilingContext,
  SpanDetail,
  groupByPhase,
  type Span,
} from "@plugins/debug/plugins/profiling/web";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { PaneChrome } from "@plugins/primitives/plugins/pane/web";
import { BUILD_PHASE_ORDER, BUILD_PHASE_CONFIG } from "../phases";
import { buildProfileDetailPane } from "../panes";
import { getBuildRunProfileByWorktree } from "../../shared/endpoints";

interface BuildData {
  spans: Span[];
  totalMs: number;
}

export function BuildProfileDetailBody(): ReactElement {
  const { worktree, buildId } = buildProfileDetailPane.useParams();
  const [data, setData] = useState<BuildData | null>(null);
  const [hovered, setHovered] = useState<Span | null>(null);
  const [error, setError] = useState(false);
  const ctxValue = useMemo(() => ({ hovered, setHovered, refreshKey: 0 }), [hovered, setHovered]);

  const load = useCallback(async () => {
    try {
      const result = await fetchEndpoint(getBuildRunProfileByWorktree, { worktree, buildId });
      setData(result);
    } catch (err) {
      if (err instanceof TypeError) return;
      setError(true);
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
          value={ctxValue}
        >
          <Inset pad="sm">
            <Clip className="rounded-md border">
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
            </Clip>
          </Inset>
        </ProfilingContext.Provider>
      )}
    </PaneChrome>
  );
}
