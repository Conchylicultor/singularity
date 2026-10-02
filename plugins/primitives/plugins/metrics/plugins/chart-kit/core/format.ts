import type { ChartUnit, ChartValue } from "./types";

// Pinned to en-US like the prototype this kit ports: a chart's numbers must
// read the same in the tooltip, the axis and the table.
const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const cents = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const compact = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});
const oneDecimal = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

/** What a missing (not covered) value reads as. */
export const NO_VALUE = "—";

/** The minus sign typography wants, not the hyphen. */
const MINUS = "−";

function sign(v: number): string {
  return v < 0 ? MINUS : "";
}

/** 1,284 below ten thousand, 12.9K above. */
function count(v: number): string {
  const a = Math.abs(v);
  return sign(v) + (a >= 10_000 ? compact.format(a) : whole.format(a));
}

/** $4.20 below $100, $1,284 below $10k, $12.9K above. */
function usd(v: number): string {
  const a = Math.abs(v);
  const body =
    a >= 10_000
      ? compact.format(a)
      : a < 100
        ? cents.format(a)
        : whole.format(a);
  return `${sign(v)}$${body}`;
}

/** 42s, 12m, 3.5h, 1.5d. */
function seconds(v: number): string {
  const a = Math.abs(v);
  const body =
    a < 60
      ? `${whole.format(a)}s`
      : a < 3600
        ? `${oneDecimal.format(a / 60)}m`
        : a < 86_400
          ? `${oneDecimal.format(a / 3600)}h`
          : `${oneDecimal.format(a / 86_400)}d`;
  return sign(v) + body;
}

/** A fraction as a percentage: 0.423 → 42.3%. */
function percent(v: number): string {
  return `${sign(v)}${oneDecimal.format(Math.abs(v) * 100)}%`;
}

const VALUE: Record<ChartUnit, (v: number) => string> = {
  count,
  lines: count,
  usd,
  seconds,
  percent,
};

/**
 * A value as a tooltip / table / tile shows it. `percent` values are fractions
 * (0.42 reads 42%); `seconds` read as the largest whole unit (s, m, h, d).
 * `null` (not covered) reads {@link NO_VALUE}, never "0".
 */
export function formatValue(unit: ChartUnit, v: ChartValue): string {
  return v === null ? NO_VALUE : VALUE[unit](v);
}

/** Like {@link formatValue} with an explicit `+` on positive values (a net or a delta). */
export function formatSigned(unit: ChartUnit, v: ChartValue): string {
  if (v === null) return NO_VALUE;
  return (v > 0 ? "+" : "") + VALUE[unit](v);
}

/**
 * A y-axis tick: always compact (the axis is narrow and its ticks are round),
 * so $12,000 reads $12K and 7200 seconds reads 2h.
 */
export function formatAxis(unit: ChartUnit, v: number): string {
  const a = Math.abs(v);
  switch (unit) {
    case "usd":
      return `${sign(v)}$${compact.format(a)}`;
    case "percent":
      return percent(v);
    case "seconds":
      return seconds(v);
    case "count":
    case "lines":
      return sign(v) + compact.format(a);
  }
}
