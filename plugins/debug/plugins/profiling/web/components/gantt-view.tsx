import { Button } from "@plugins/primitives/plugins/ui-kit/web";
import { useState, type ReactElement } from "react";
import { MdRefresh } from "react-icons/md";
import { Profiling } from "../slots";
import { ProfilingContext, SpanDetail } from "./shared";
import type { Span } from "./shared";

export function GanttView(): ReactElement {
  const [hovered, setHovered] = useState<Span | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <ProfilingContext.Provider value={{ hovered, setHovered, refreshKey }}>
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex items-center border-b px-4 py-2">
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="xs"
            onClick={() => setRefreshKey((k) => k + 1)}
          >
            <MdRefresh className="size-3.5" />
            Refresh
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y">
          <Profiling.Section.Render>
            {(section) => (
              <div key={section.id}>
                <section.component />
              </div>
            )}
          </Profiling.Section.Render>
        </div>

        <SpanDetail span={hovered} />
      </div>
    </ProfilingContext.Provider>
  );
}
