import { useState } from "react";
import { setConfigValue, useConfigValues } from "@plugins/config/web";
import { cn } from "@/lib/utils";
import { commitsConfig } from "../../shared/config";
import { CumulativeCommitsChart } from "./cumulative-chart";
import { CommitsRateChart } from "./rate-chart";
import { CumulativeCommitsCategoryChart, CommitsRateCategoryChart } from "./commits-category-charts";

export function CommitsSection() {
  const [byCategory, setByCategory] = useState(false);
  const { filterRebases } = useConfigValues(commitsConfig, "stats-commits");

  const toggle = () =>
    void setConfigValue("stats-commits.filterRebases", !filterRebases);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setByCategory((v) => !v)}
          className={cn(
            "rounded-full border px-3 py-1 text-xs transition-colors shrink-0",
            byCategory
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          By category
        </button>
        <button
          type="button"
          onClick={toggle}
          title={
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            filterRebases
              ? "Deduplication on: multi-commit pushes counted once — click to disable"
              : "Deduplication off: every commit counted — click to filter rebases"
          }
          className={cn(
            "rounded-full border px-3 py-1 text-xs transition-colors",
            // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
            filterRebases
              ? "bg-primary text-primary-foreground border-primary"
              : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
        >
          Filter rebases
        </button>
      </div>
      <div>
        <h3 className="mb-3 text-xs font-medium text-muted-foreground">Over time</h3>
        {byCategory
          ? <CumulativeCommitsCategoryChart dedup={filterRebases} />
          : <CumulativeCommitsChart dedup={filterRebases} />}
      </div>
      <div>
        <h3 className="mb-3 text-xs font-medium text-muted-foreground">Per period</h3>
        {byCategory
          ? <CommitsRateCategoryChart dedup={filterRebases} />
          : <CommitsRateChart dedup={filterRebases} />}
      </div>
    </div>
  );
}
