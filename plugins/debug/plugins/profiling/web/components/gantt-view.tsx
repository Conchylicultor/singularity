import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useMemo, useState, type ReactElement } from "react";
import { MdRefresh } from "react-icons/md";
import { Column } from "@plugins/primitives/plugins/css/plugins/column/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Line } from "@plugins/primitives/plugins/css/plugins/line/web";
import { Profiling } from "../slots";
import { ProfilingContext, SpanDetail } from "./shared";
import type { Span } from "./shared";

export function GanttView(): ReactElement {
  const [hovered, setHovered] = useState<Span | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const ctxValue = useMemo(
    () => ({ hovered, setHovered, refreshKey }),
    [hovered, setHovered, refreshKey],
  );

  return (
    <ProfilingContext.Provider value={ctxValue}>
      <Column
        className="h-full"
        header={
          <Line className="border-b px-lg py-sm">
            {/* Empty grow cell: it absorbs the slack so Refresh sits flush-right. */}
            <Fill />
            <Button variant="ghost" onClick={() => setRefreshKey((k) => k + 1)}>
              <MdRefresh className="size-3.5" />
              Refresh
            </Button>
          </Line>
        }
        body={
          <div className="divide-y">
            <Profiling.Section.Render>
              {(section) => (
                <div key={section.id}>
                  <section.component />
                </div>
              )}
            </Profiling.Section.Render>
          </div>
        }
        footer={<SpanDetail span={hovered} />}
      />
    </ProfilingContext.Provider>
  );
}
