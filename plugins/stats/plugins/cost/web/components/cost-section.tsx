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
          <h3 className="mb-3 text-xs font-medium text-muted-foreground">Daily cost by model</h3>
          <DailyCostChart />
        </div>
        <div>
          <h3 className="mb-3 text-xs font-medium text-muted-foreground">Sessions per day by model family</h3>
          <ModelUsageChart />
        </div>
      </div>
      <div>
        <h3 className="mb-3 text-xs font-medium text-muted-foreground">Cumulative cost over time</h3>
        <CumulativeCostChart />
      </div>
    </div>
  );
}
