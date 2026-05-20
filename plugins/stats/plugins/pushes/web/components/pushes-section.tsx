import { useState } from "react";
import { cn } from "@/lib/utils";
import { WaitTimeChart } from "./wait-time-chart";
import { ThroughputChart } from "./throughput-chart";
import { StepBreakdownChart } from "./step-breakdown-chart";

type Bucket = "day" | "week" | "month";
const BUCKETS: { id: Bucket; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
];

export function PushesSection() {
  const [bucket, setBucket] = useState<Bucket>("day");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-1.5">
        {BUCKETS.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => setBucket(b.id)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs transition-colors",
              bucket === b.id
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            {b.label}
          </button>
        ))}
      </div>
      <ThroughputChart bucket={bucket} />
      <WaitTimeChart bucket={bucket} />
      <StepBreakdownChart bucket={bucket} />
    </div>
  );
}
