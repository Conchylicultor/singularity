import type {
  ChartBucket,
  ChartCompare,
  ChartSeries,
  ChartValue,
} from "../../core";
import type { HistogramBin } from "../components/histogram";

/**
 * Fixed data for the chart-kit specimens: September 2026 as 30 day buckets, the
 * last one partial (today). Deterministic — every render, light or dark, draws
 * the same marks.
 */
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
/** Sep 1 2026 is a Tuesday. */
const FIRST_WEEKDAY = 2;

export const SPECIMEN_BUCKETS: ChartBucket[] = Array.from(
  { length: 30 },
  (_, i) => ({
    short: `Sep ${i + 1}`,
    label: `${DAYS[(FIRST_WEEKDAY + i) % 7]}, Sep ${i + 1}`,
    partial: i === 29 ? true : undefined,
  }),
);

/** A smooth, repeatable wave: `base` ± `amp`, never below 0. */
function wave(base: number, amp: number, phase: number, today = 0.4): number[] {
  return SPECIMEN_BUCKETS.map((_, i) => {
    const v = Math.max(
      0,
      Math.round(base + amp * Math.sin(i / 3 + phase) + ((i * 7) % 5)),
    );
    // Today is only partly through: a fraction of a full day.
    return i === 29 ? Math.round(v * today) : v;
  });
}

export const COMPLETED: ChartSeries[] = [
  { key: "feature", label: "Feature", values: wave(8, 4, 0) },
  { key: "fix", label: "Fix", values: wave(6, 3, 1.3) },
  { key: "infra", label: "Infra", values: wave(3, 2, 2.1) },
];

export const COMPLETED_PREVIOUS: ChartCompare = {
  label: "Previous 30 days",
  values: wave(15, 5, 0.8, 1).map((v, i) =>
    i === 29 ? Math.round(v * 0.4) : v,
  ),
};

/** Open tasks at the end of each day, with a two-day gap (not covered). */
export const OPEN: ChartSeries[] = [
  {
    key: "open",
    label: "Open tasks",
    values: wave(60, 12, 0.3, 1).map((v, i): ChartValue =>
      i === 11 || i === 12 ? null : v,
    ),
  },
];

export const OPEN_PREVIOUS: ChartCompare = {
  label: "Previous 30 days",
  values: wave(52, 10, 1.1, 1),
};

export const FILED_VS_COMPLETED: ChartSeries[] = [
  { key: "completed", label: "Completed", values: wave(14, 5, 0) },
  { key: "filed", label: "Filed", values: wave(12, 6, 1.7) },
];

export const NET: ChartSeries[] = [
  {
    key: "net",
    label: "Completed − filed",
    values: SPECIMEN_BUCKETS.map((_, i) => {
      const c = FILED_VS_COMPLETED[0]!.values[i] ?? 0;
      const f = FILED_VS_COMPLETED[1]!.values[i] ?? 0;
      return c - f;
    }),
  },
];

export const SPEND: ChartSeries[] = [
  { key: "opus", label: "Opus", values: wave(42, 18, 0.5).map((v) => v * 1.5) },
  { key: "sonnet", label: "Sonnet", values: wave(18, 8, 1.9) },
];

export const COST_BINS: HistogramBin[] = [
  {
    label: "<$0.10",
    range: "Under $0.10",
    count: 184,
    extra: [{ label: "spent in this band", value: "$9" }],
  },
  {
    label: "$0.10",
    range: "$0.10 – $0.50",
    count: 262,
    extra: [{ label: "spent in this band", value: "$71" }],
  },
  {
    label: "$0.50",
    range: "$0.50 – $1",
    count: 148,
    extra: [{ label: "spent in this band", value: "$108" }],
  },
  {
    label: "$1",
    range: "$1 – $5",
    count: 121,
    extra: [{ label: "spent in this band", value: "$286" }],
  },
  {
    label: "$5",
    range: "$5 – $10",
    count: 34,
    extra: [{ label: "spent in this band", value: "$241" }],
  },
  {
    label: "$10",
    range: "$10 – $25",
    count: 12,
    extra: [{ label: "spent in this band", value: "$189" }],
  },
  {
    label: "$25+",
    range: "$25 and over",
    count: 3,
    extra: [{ label: "spent in this band", value: "$112" }],
  },
];
