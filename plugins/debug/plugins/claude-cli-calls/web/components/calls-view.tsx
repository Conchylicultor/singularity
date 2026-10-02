import { ResourceErrorInline } from "@plugins/primitives/plugins/live-state/web";
import {
  useLive,
  type LiveListResult,
} from "@plugins/network/plugins/live/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import {
  FilterChip,
  FilterGroup,
  useChipFilter,
} from "@plugins/primitives/plugins/filter-chips/web";
import {
  InfiniteScrollFooter,
  useInfiniteScroll,
} from "@plugins/primitives/plugins/cursor-pagination/web";
import { claudeCliCalls } from "@plugins/infra/plugins/claude-cli/core";
import type { ClaudeCliCall } from "@plugins/infra/plugins/claude-cli/core";
import {
  MODEL_TIERS,
  modelMeta,
  type ConversationModel,
  type ModelCatalog,
  type ModelTier,
} from "@plugins/conversations/plugins/model-provider/core";
import { useModelCatalog } from "@plugins/conversations/plugins/model-provider/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { CallRow } from "./call-row";

type ModelFilter = "all" | ModelTier;

/**
 * A tier's concrete model ids, from the live catalog. The tier is not a
 * column, so the tier chip is an `in` over these — the server filters, and a
 * tier's calls older than the loaded window are still found.
 */
function modelsOfTier(
  tier: ModelTier,
  catalog: ModelCatalog,
): ConversationModel[] {
  return catalog.versions
    .map((v) => v.id)
    .filter((id) => modelMeta(id).family === tier);
}

export function CallsView() {
  const catalog = useModelCatalog();
  if (catalog.status === "loading") return <Loading />;
  if (catalog.status === "error")
    return (
      <ResourceErrorInline
        variant="block"
        subject="the model catalog"
        error={catalog.error}
        refetch={catalog.refetch}
      />
    );
  return <CallsViewBody catalog={catalog.data} />;
}

function CallsViewBody({ catalog }: { catalog: ModelCatalog }) {
  const modelChip = useChipFilter<ModelFilter>("all");
  const sourceChip = useChipFilter<string>("all");
  const filtered = modelChip.value !== "all" || sourceChip.value !== "all";
  const calls = useLive(claudeCliCalls, {
    where: {
      sourceName: sourceChip.value === "all" ? undefined : sourceChip.value,
      model:
        modelChip.value === "all"
          ? undefined
          : { in: modelsOfTier(modelChip.value, catalog) },
    },
  });

  return (
    <Stack gap="none" className="h-full">
      <Stack
        direction="row"
        wrap
        gap="sm"
        align="center"
        className="border-b px-md py-sm"
      >
        <FilterGroup label="Model">
          <FilterChip
            active={modelChip.value === "all"}
            onClick={() => modelChip.setValue("all")}
          >
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
        <SourceChips value={sourceChip.value} onPick={sourceChip.setValue} />
        {/* An empty Fill absorbs the slack, so the count sits flush right. */}
        <Fill />
        {/* The count only once the window is known; a failure says so below. */}
        {calls.status === "ready" && (
          <Text
            as="div"
            variant="caption"
            className="text-muted-foreground tabular-nums"
          >
            {calls.data.length}
            {calls.canGrow ? "+" : ""} calls
          </Text>
        )}
      </Stack>
      <Scroll axis="both" fill>
        {calls.status === "loading" ? (
          <Loading />
        ) : calls.status === "error" ? (
          <ResourceErrorInline
            variant="block"
            subject="the calls"
            error={calls.error}
            refetch={calls.refetch}
          />
        ) : calls.data.length === 0 ? (
          <Center className="h-full">
            <Text as="div" variant="body" className="text-muted-foreground">
              {filtered
                ? "No calls match the current filter."
                : "No claude --print calls recorded yet."}
            </Text>
          </Center>
        ) : (
          <CallList list={calls} />
        )}
      </Scroll>
    </Stack>
  );
}

/**
 * The loaded window of calls, growing by one page when its end scrolls into
 * view — up to the whole log (`RECENT_CALLS_LIMIT`).
 */
function CallList({
  list,
}: {
  list: Extract<LiveListResult<ClaudeCliCall>, { status: "ready" }>;
}) {
  const scroll = useInfiniteScroll({
    hasNextPage: list.canGrow,
    isFetchingNextPage: list.growing,
    isFetchNextPageError: false,
    fetchNextPage: list.loadMore,
    rootMargin: "200px",
  });
  return (
    <>
      <ul className="divide-y">
        {list.data.map((c) => (
          <CallRow key={c.id} call={c} />
        ))}
      </ul>
      <InfiniteScrollFooter handle={scroll} />
    </>
  );
}

/**
 * One chip per source across the whole log (not the loaded window), with its
 * count: a `groupBy` grouping, deliberately unfiltered so every chip stays
 * visible while one is picked.
 */
function SourceChips({
  value,
  onPick,
}: {
  value: string;
  onPick: (source: string) => void;
}) {
  const sources = useLive(claudeCliCalls, { groupBy: "sourceName" });
  if (sources.status === "loading") return <Loading variant="spinner" />;
  if (sources.status === "error") {
    return (
      <ResourceErrorInline
        variant="inline"
        subject="the sources"
        error={sources.error}
        refetch={sources.refetch}
      />
    );
  }
  // `source_name` is NOT NULL, so no NULL group ever comes back.
  const chips = sources.data.filter(
    (g): g is { value: string; count: number } => g.value !== null,
  );
  if (chips.length === 0) return null;
  return (
    <FilterGroup label="Source">
      <FilterChip active={value === "all"} onClick={() => onPick("all")}>
        all
      </FilterChip>
      {chips.map((g) => (
        <FilterChip
          key={g.value}
          active={value === g.value}
          onClick={() => onPick(g.value)}
        >
          {g.value} <span className="opacity-60">{g.count}</span>
        </FilterChip>
      ))}
      {(sources.canGrow || sources.growing) && (
        <FilterChip active={false} onClick={sources.loadMore}>
          {sources.growing ? "Loading…" : "More"}
        </FilterChip>
      )}
    </FilterGroup>
  );
}
