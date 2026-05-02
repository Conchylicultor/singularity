import { CostKpis } from "./cost-kpis";
import { CumulativeCostChart } from "./cumulative-cost-chart";
import { DailyCostChart } from "./daily-cost-chart";

export function CostSection() {
  return (
    <div className="flex flex-col gap-6">
      <CostKpis />
      <div>
        <h3 className="mb-3 text-xs font-medium text-muted-foreground">Daily cost by model</h3>
        <DailyCostChart />
      </div>
      <div>
        <h3 className="mb-3 text-xs font-medium text-muted-foreground">Cumulative cost over time</h3>
        <CumulativeCostChart />
      </div>
    </div>
  );
}
