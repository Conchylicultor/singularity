import { Text } from "@plugins/primitives/plugins/text/web";
import { CostKpis } from "./cost-kpis";
import { CumulativeCostChart } from "./cumulative-cost-chart";
import { DailyCostChart } from "./daily-cost-chart";
import { ModelUsageChart } from "./model-usage-chart";

export function CostSection() {
  return (
    <div className="flex flex-col gap-6">
      <CostKpis />
      <div className="grid grid-cols-2 gap-6">
        <div>
          <Text as="h3" variant="caption" className="mb-3 font-medium text-muted-foreground">Daily cost by model</Text>
          <DailyCostChart />
        </div>
        <div>
          <Text as="h3" variant="caption" className="mb-3 font-medium text-muted-foreground">Sessions per day by model family</Text>
          <ModelUsageChart />
        </div>
      </div>
      <div>
        <Text as="h3" variant="caption" className="mb-3 font-medium text-muted-foreground">Cumulative cost over time</Text>
        <CumulativeCostChart />
      </div>
    </div>
  );
}
