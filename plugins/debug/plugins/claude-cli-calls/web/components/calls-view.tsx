import { useMemo } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { FilterChip, FilterGroup, useChipFilter } from "@plugins/primitives/plugins/filter-chips/web";
import { claudeCliCallsResource } from "@plugins/infra/plugins/claude-cli/core";
import type { ClaudeCliCall } from "@plugins/infra/plugins/claude-cli/core";
import { CallRow } from "./call-row";

type ModelFilter = "all" | "haiku" | "sonnet" | "opus";

export function CallsView() {
  const result = useResource(claudeCliCallsResource);
  const modelChip = useChipFilter<ModelFilter>("all");
  const sourceChip = useChipFilter<string>("all");

  const calls = useMemo(
    () => result.pending ? [] : result.data,
    [result],
  );

  const sources = useMemo(() => {
    const set = new Set<string>();
    for (const c of calls) set.add(c.sourceName);
    return Array.from(set).sort();
  }, [calls]);

  const visible = useMemo(
    () =>
      calls.filter(
        (c) =>
          modelChip.matches(c.model as ModelFilter) &&
          sourceChip.matches(c.sourceName),
      ),
    [calls, modelChip, sourceChip],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <FilterGroup label="Model">
          <FilterChip active={modelChip.value === "all"} onClick={() => modelChip.setValue("all")}>
            all
          </FilterChip>
          <FilterChip active={modelChip.value === "haiku"} onClick={() => modelChip.setValue("haiku")}>
            haiku
          </FilterChip>
          <FilterChip active={modelChip.value === "sonnet"} onClick={() => modelChip.setValue("sonnet")}>
            sonnet
          </FilterChip>
          <FilterChip active={modelChip.value === "opus"} onClick={() => modelChip.setValue("opus")}>
            opus
          </FilterChip>
        </FilterGroup>
        {sources.length > 0 && (
          <FilterGroup label="Source">
            <FilterChip active={sourceChip.value === "all"} onClick={() => sourceChip.setValue("all")}>
              all
            </FilterChip>
            {sources.map((s) => (
              <FilterChip
                key={s}
                active={sourceChip.value === s}
                onClick={() => sourceChip.setValue(s)}
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
