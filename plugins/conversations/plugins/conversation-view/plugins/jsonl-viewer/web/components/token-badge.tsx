import type { TokenUsage } from "../../shared";
import { formatTokenCount, tokenUsageTooltip } from "../utils";

export function TokenBadge({ usage }: { usage: TokenUsage }) {
  const context = usage.input + usage.cacheRead + usage.cacheCreation;
  return (
    <span
      className="tabular-nums text-muted-foreground/70"
      title={tokenUsageTooltip(usage)}
    >
      ↑{formatTokenCount(context)} ↓{formatTokenCount(usage.output)}
    </span>
  );
}
