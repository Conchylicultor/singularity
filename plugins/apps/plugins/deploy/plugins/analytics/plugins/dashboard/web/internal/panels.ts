import {
  RECORDED_FIELDS,
  averageTimeOnPageMs,
  bounceRate,
  conversionRate,
  visitorShare,
  type AnalyticsReport,
  type Dimension,
  type RecordedColumn,
  type ReportRow,
} from "@plugins/apps/plugins/deploy/plugins/analytics/plugins/collect/core";
import { formatDurationMs, formatPercent, orDash } from "./format";

/** One numeric column of a ranked list. */
export interface PanelColumn {
  label: string;
  /** Rendered text for a row. */
  cell: (row: ReportRow, report: AnalyticsReport) => string;
}

export interface PanelTab {
  id: string;
  label: string;
  dimension: Dimension;
  /** The count the row's bar is proportional to, and its column. */
  primary: { label: string; value: (row: ReportRow) => number };
  secondary: PanelColumn;
  note?: string;
}

export interface PanelDef {
  id: string;
  title: string;
  tabs: readonly PanelTab[];
  /** Spans both columns of the panel grid. */
  wide?: true;
}

const visitors = { label: "Visitors", value: (r: ReportRow) => r.visitors };
const share: PanelColumn = {
  label: "Share",
  cell: (row, report) =>
    orDash(visitorShare(row, report.current.summary), formatPercent),
};

/**
 * Exit rate of a page: the visits that left from it over the times it was
 * viewed. Its views live on the `page` row of the same path.
 */
function exitRate(row: ReportRow, report: AnalyticsReport): number | null {
  const page = report.rows.page.find((p) => p.value === row.value);
  return page && page.pageviews > 0 ? row.visits / page.pageviews : null;
}

export const PANELS: readonly PanelDef[] = [
  {
    id: "pages",
    title: "Pages",
    tabs: [
      {
        id: "top",
        label: "Top pages",
        dimension: "page",
        primary: visitors,
        secondary: {
          label: "Time on page",
          cell: (row) => orDash(averageTimeOnPageMs(row), formatDurationMs),
        },
      },
      {
        id: "entry",
        label: "Entry",
        dimension: "entry_page",
        primary: { label: "Visits", value: (r) => r.visits },
        secondary: {
          label: "Bounce",
          cell: (row) => orDash(bounceRate(row), formatPercent),
        },
      },
      {
        id: "exit",
        label: "Exit",
        dimension: "exit_page",
        primary: { label: "Exits", value: (r) => r.visits },
        secondary: {
          label: "Exit rate",
          cell: (row, report) => orDash(exitRate(row, report), formatPercent),
        },
      },
    ],
  },
  {
    id: "sources",
    title: "Sources",
    tabs: [
      {
        id: "channels",
        label: "Channels",
        dimension: "channel",
        primary: visitors,
        secondary: share,
        note: "Click a source to see which pages its visitors landed on.",
      },
      {
        id: "referrers",
        label: "Referrers",
        dimension: "referrer_host",
        primary: visitors,
        secondary: share,
      },
      {
        id: "campaigns",
        label: "Campaigns",
        dimension: "utm_campaign",
        primary: visitors,
        secondary: share,
        note: "From utm_* tags on the landing URL.",
      },
      {
        id: "linking",
        label: "Linking pages",
        dimension: "referrer_path",
        primary: visitors,
        secondary: share,
        note: "The exact page that linked, when the source sends it. Many sites send only their domain.",
      },
    ],
  },
  {
    id: "locations",
    title: "Locations",
    tabs: [
      {
        id: "countries",
        label: "Countries",
        dimension: "country",
        primary: visitors,
        secondary: share,
      },
      {
        id: "languages",
        label: "Languages",
        dimension: "language",
        primary: visitors,
        secondary: share,
      },
    ],
  },
  {
    id: "devices",
    title: "Devices",
    tabs: [
      {
        id: "device",
        label: "Device",
        dimension: "device",
        primary: visitors,
        secondary: share,
      },
      {
        id: "browser",
        label: "Browser",
        dimension: "browser",
        primary: visitors,
        secondary: share,
      },
      {
        id: "os",
        label: "OS",
        dimension: "os",
        primary: visitors,
        secondary: share,
      },
    ],
  },
  {
    id: "events",
    title: "Events",
    wide: true,
    tabs: [
      {
        id: "events",
        label: "Custom events",
        dimension: "event",
        primary: { label: "Count", value: (r) => r.events },
        secondary: {
          label: "Conversion",
          cell: (row, report) =>
            orDash(conversionRate(row, report.current.summary), formatPercent),
        },
        note: "Conversion is the share of unique visitors who fired the event at least once.",
      },
    ],
  },
];

/**
 * Dimensions whose storage exists but nothing fills yet, read off the recorded
 * field list — so a panel says "not collected yet" exactly while the field
 * does, and starts showing rows the day the field loses the mark.
 */
const DIMENSION_COLUMN: Partial<Record<Dimension, RecordedColumn>> = {
  country: "country",
};

export function isNotCollectedYet(dimension: Dimension): boolean {
  const column = DIMENSION_COLUMN[dimension];
  if (!column) return false;
  return RECORDED_FIELDS.some(
    (f) =>
      "notCollectedYet" in f &&
      f.notCollectedYet &&
      (f.columns as readonly RecordedColumn[]).includes(column),
  );
}
