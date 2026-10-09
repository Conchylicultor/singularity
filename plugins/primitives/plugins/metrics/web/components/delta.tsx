import type { ReactNode } from "react";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { Icon } from "@plugins/ui/plugins/icons/web";
import type { Delta as DeltaValue, Polarity } from "../../core";

const upIcon = symbol("north");
const downIcon = symbol("south");

export type DeltaTone = "good" | "bad" | "flat";

/**
 * Whether a change is good news: its direction × the metric's polarity. A
 * neutral metric (neither way is better) never wears a status colour.
 */
export function deltaTone(value: number, polarity: Polarity): DeltaTone {
  if (value === 0 || polarity === "neutral") return "flat";
  return value > 0 === (polarity === "up") ? "good" : "bad";
}

const TONE_CLASS: Record<DeltaTone, string> = {
  good: "text-success",
  bad: "text-destructive-text",
  flat: "text-muted-foreground",
};

/** 4.2% below ten percent, 42% above. */
function pct(v: number): string {
  const a = Math.abs(v);
  return `${(a * 100).toFixed(a < 0.1 ? 1 : 0)}%`;
}

export interface DeltaProps {
  delta: DeltaValue;
  polarity: Polarity;
  /** The period compared with ("vs Aug 1 – Aug 30"). */
  vs: string;
}

/**
 * The change against the previous period: an arrow and a percentage, coloured
 * by whether it is good news, then the period it is measured against. "New"
 * when the previous period had nothing; the bare period when either side is
 * not covered (a change against an unknown is unknown, not 0%).
 */
export function Delta({ delta, polarity, vs }: DeltaProps): ReactNode {
  if (delta.kind === "none") {
    return (
      <Text variant="caption" tone="muted" data-delta="none">
        {vs}
      </Text>
    );
  }
  const tone = delta.kind === "new" ? "flat" : deltaTone(delta.value, polarity);
  return (
    <Inline gap="2xs" data-delta={delta.kind} data-tone={tone}>
      <Text variant="caption" className={cn("tabular-nums", TONE_CLASS[tone])}>
        {delta.kind === "pct" && delta.value !== 0 && (
          <Icon
            icon={delta.value > 0 ? upIcon : downIcon}
            className="size-3"
            aria-hidden
          />
        )}
        {delta.kind === "new" ? "New" : pct(delta.value)}
      </Text>
      <Text variant="caption" tone="muted">
        {vs}
      </Text>
    </Inline>
  );
}
