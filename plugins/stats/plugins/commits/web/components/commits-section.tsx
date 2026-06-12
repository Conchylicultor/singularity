import { useState } from "react";
import { useConfig, useSetConfig } from "@plugins/config_v2/web";
import { ToggleChip } from "@plugins/primitives/plugins/toggle-chip/web";
import { Stack } from "@plugins/primitives/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { commitsConfig } from "../../shared/config";
import { CumulativeCommitsChart } from "./cumulative-chart";
import { CommitsRateChart } from "./rate-chart";
import { CumulativeCommitsCategoryChart, CommitsRateCategoryChart } from "./commits-category-charts";

export function CommitsSection() {
  const [byCategory, setByCategory] = useState(false);
  const { filterRebases } = useConfig(commitsConfig);
  const setConfig = useSetConfig(commitsConfig);

  const toggle = () =>
    setConfig("filterRebases", !filterRebases);

  return (
    <Stack gap="xl">
      <Stack direction="row" gap="sm" justify="end">
        <ToggleChip
          active={byCategory}
          onClick={() => setByCategory((v) => !v)}
          className="shrink-0"
        >
          By category
        </ToggleChip>
        <ToggleChip
          active={filterRebases}
          onClick={toggle}
          title={
            filterRebases
              ? "Deduplication on: multi-commit pushes counted once — click to disable"
              : "Deduplication off: every commit counted — click to filter rebases"
          }
        >
          Filter rebases
        </ToggleChip>
      </Stack>
      <Stack gap="md">
        <Text as="h3" variant="caption" className="font-medium text-muted-foreground">Over time</Text>
        {byCategory
          ? <CumulativeCommitsCategoryChart dedup={filterRebases} />
          : <CumulativeCommitsChart dedup={filterRebases} />}
      </Stack>
      <Stack gap="md">
        <Text as="h3" variant="caption" className="font-medium text-muted-foreground">Per period</Text>
        {byCategory
          ? <CommitsRateCategoryChart dedup={filterRebases} />
          : <CommitsRateChart dedup={filterRebases} />}
      </Stack>
    </Stack>
  );
}
