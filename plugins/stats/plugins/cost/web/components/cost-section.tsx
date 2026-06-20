import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Grid } from "@plugins/primitives/plugins/css/plugins/grid/web";
import { CostKpis } from "./cost-kpis";
import { CumulativeCostChart } from "./cumulative-cost-chart";
import { DailyCostChart } from "./daily-cost-chart";
import { ModelUsageChart } from "./model-usage-chart";

export function CostSection() {
  return (
    <Stack gap="xl">
      <CostKpis />
      <Grid cols={2} gap="xl">
        <Stack gap="md">
          <Text as="h3" variant="caption" className="font-medium text-muted-foreground">Daily cost by model</Text>
          <DailyCostChart />
        </Stack>
        <Stack gap="md">
          <Text as="h3" variant="caption" className="font-medium text-muted-foreground">Sessions per day by model family</Text>
          <ModelUsageChart />
        </Stack>
      </Grid>
      <Stack gap="md">
        <Text as="h3" variant="caption" className="font-medium text-muted-foreground">Cumulative cost over time</Text>
        <CumulativeCostChart />
      </Stack>
    </Stack>
  );
}
