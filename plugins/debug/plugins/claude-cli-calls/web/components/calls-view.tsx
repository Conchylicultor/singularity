import { useMemo, useState } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { claudeCliCallsResource } from "@plugins/infra/plugins/claude-cli/shared";
import type { ClaudeCliCall } from "@plugins/infra/plugins/claude-cli/shared";
import { CallRow } from "./call-row";
import { cn } from "@/lib/utils";

type ModelFilter = "all" | "haiku" | "sonnet" | "opus";
type SourceFilter = string;

export function CallsView() {
  const { data } = useResource(claudeCliCallsResource);
  const calls = data;
  const [modelFilter, setModelFilter] = useState<ModelFilter>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");

  const sources = useMemo(() => {
    const set = new Set<string>();
    for (const c of calls) set.add(c.sourceName);
    return Array.from(set).sort();
  }, [calls]);

  const visible = useMemo(
    () =>
      calls.filter((c) => {
        if (modelFilter !== "all" && c.model !== modelFilter) return false;
        if (sourceFilter !== "all" && c.sourceName !== sourceFilter) return false;
        return true;
      }),
    [calls, modelFilter, sourceFilter],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <FilterGroup label="Model">
          <FilterChip active={modelFilter === "all"} onClick={() => setModelFilter("all")}>
            all
          </FilterChip>
          <FilterChip active={modelFilter === "haiku"} onClick={() => setModelFilter("haiku")}>
            haiku
          </FilterChip>
          <FilterChip active={modelFilter === "sonnet"} onClick={() => setModelFilter("sonnet")}>
            sonnet
          </FilterChip>
          <FilterChip active={modelFilter === "opus"} onClick={() => setModelFilter("opus")}>
            opus
          </FilterChip>
        </FilterGroup>
        {sources.length > 0 && (
          <FilterGroup label="Source">
            <FilterChip active={sourceFilter === "all"} onClick={() => setSourceFilter("all")}>
              all
            </FilterChip>
            {sources.map((s) => (
              <FilterChip
                key={s}
                active={sourceFilter === s}
                onClick={() => setSourceFilter(s)}
              >
                {s}
              </FilterChip>
            ))}
          </FilterGroup>
        )}
        <div className="flex-1" />
        <div className="text-xs text-muted-foreground tabular-nums">
          {visible.length}
          {visible.length !== calls.length ? ` / ${calls.length}` : ""} calls
        </div>
      </div>
      <div className="flex-1 overflow-auto">
        {visible.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {calls.length === 0
              ? "No claude --print calls recorded yet."
              : "No calls match the current filter."}
          </div>
        ) : (
          <ul className="divide-y">
            {visible.map((c: ClaudeCliCall) => (
              <CallRow key={c.id} call={c} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-xs text-muted-foreground">{label}:</span>
      {children}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded px-2 py-0.5 text-xs font-medium transition-colors",
        active
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
