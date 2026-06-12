import { useMemo } from "react";
import { useResource, ResourceView } from "@plugins/primitives/plugins/live-state/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { FilterChip, FilterGroup, useChipFilter } from "@plugins/primitives/plugins/filter-chips/web";
import { claudeCliCallsResource } from "@plugins/infra/plugins/claude-cli/core";
import type { ClaudeCliCall } from "@plugins/infra/plugins/claude-cli/core";
import {
  MODEL_TIERS,
  MODEL_REGISTRY,
  type ModelTier,
} from "@plugins/conversations/plugins/model-provider/core";
import { Text } from "@plugins/primitives/plugins/text/web";
import { CallRow } from "./call-row";

type ModelFilter = "all" | ModelTier;

function callMatchesTier(call: ClaudeCliCall, tier: ModelTier): boolean {
  const meta = MODEL_REGISTRY[call.model as keyof typeof MODEL_REGISTRY];
  return meta?.family === tier;
}

export function CallsView() {
  const result = useResource(claudeCliCallsResource);
  return (
    <ResourceView resource={result} fallback={<Loading />}>
      {(calls) => <CallsViewInner calls={calls} />}
    </ResourceView>
  );
}

function CallsViewInner({ calls }: { calls: ClaudeCliCall[] }) {
  const modelChip = useChipFilter<ModelFilter>("all");
  const sourceChip = useChipFilter<string>("all");

  const sources = useMemo(() => {
    const set = new Set<string>();
    for (const c of calls) set.add(c.sourceName);
    return Array.from(set).sort();
  }, [calls]);

  const visible = useMemo(
    () =>
      calls.filter(
        (c) =>
          (modelChip.value === "all" || callMatchesTier(c, modelChip.value)) &&
          sourceChip.matches(c.sourceName),
      ),
    [calls, modelChip, sourceChip],
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-sm border-b px-md py-sm">
        <FilterGroup label="Model">
          <FilterChip active={modelChip.value === "all"} onClick={() => modelChip.setValue("all")}>
            all
          </FilterChip>
          {MODEL_TIERS.map((tier) => (
            <FilterChip
              key={tier}
              active={modelChip.value === tier}
              onClick={() => modelChip.setValue(tier)}
            >
              {tier}
            </FilterChip>
          ))}
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
        <Text as="div" variant="caption" className="text-muted-foreground tabular-nums">
          {visible.length}
          {visible.length !== calls.length ? ` / ${calls.length}` : ""} calls
        </Text>
      </div>
      <div className="flex-1 overflow-auto">
        {visible.length === 0 ? (
          <Text as="div" variant="body" className="flex h-full items-center justify-center text-muted-foreground">
            {calls.length === 0
              ? "No claude --print calls recorded yet."
              : "No calls match the current filter."}
          </Text>
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
