import { useState, type ReactElement } from "react";
import { MdRefresh } from "react-icons/md";
import { Profiling } from "../slots";
import { ProfilingContext, SpanDetail } from "./shared";
import type { Span } from "./shared";

export function GanttView(): ReactElement {
  const sections = Profiling.Section.useContributions();
  const [hovered, setHovered] = useState<Span | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const sorted = [...sections].sort((a, b) => a.order - b.order);

  return (
    <ProfilingContext.Provider value={{ hovered, setHovered, refreshKey }}>
      <div className="flex h-full flex-col overflow-hidden">
        <div className="flex items-center border-b px-4 py-2">
          <div className="flex-1" />
          <button
            className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
            onClick={() => setRefreshKey((k) => k + 1)}
          >
            <MdRefresh className="size-3.5" />
            Refresh
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {sorted.map((section, i) => (
            <div key={section.id} className={i > 0 ? "border-t" : ""}>
              <section.component />
            </div>
          ))}
        </div>

        <SpanDetail span={hovered} />
      </div>
    </ProfilingContext.Provider>
  );
}
