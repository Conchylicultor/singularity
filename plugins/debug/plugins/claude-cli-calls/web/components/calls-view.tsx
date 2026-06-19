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
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
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
    <Stack gap="none" className="h-full">
      <Frame
        className="border-b px-md py-sm"
        content={
          <Cluster>
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
          </Cluster>
        }
        trailing={
          <Text as="div" variant="caption" className="text-muted-foreground tabular-nums">
            {visible.length}
            {visible.length !== calls.length ? ` / ${calls.length}` : ""} calls
          </Text>
        }
      />
      <Scroll axis="both" fill>
        {visible.length === 0 ? (
          <Center className="h-full">
            <Text as="div" variant="body" className="text-muted-foreground">
              {calls.length === 0
                ? "No claude --print calls recorded yet."
                : "No calls match the current filter."}
            </Text>
          </Center>
        ) : (
          <ul className="divide-y">
            {visible.map((c: ClaudeCliCall) => (
              <CallRow key={c.id} call={c} />
            ))}
          </ul>
        )}
      </Scroll>
    </Stack>
  );
}
