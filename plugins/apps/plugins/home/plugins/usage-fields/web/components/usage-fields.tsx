import { useMemo, type ReactNode } from "react";
import type { ActiveApp } from "@plugins/apps-core/web";
import type {
  FieldDef,
  FieldExtensionProps,
} from "@plugins/primitives/plugins/data-view/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { formatValue } from "@plugins/primitives/plugins/metrics/plugins/chart-kit/core";
import type { AppUsageSummaryRow } from "@plugins/apps-core/plugins/app-usage/core";
import { useAppUsageSummary } from "@plugins/apps-core/plugins/app-usage/web";

type Summary =
  | { kind: "loading" }
  | { kind: "failed"; error: Error; refetch?: () => Promise<void> }
  | { kind: "ready"; byApp: ReadonlyMap<string, AppUsageSummaryRow> };

type NumericKey =
  "launches7d" | "focusedMs7d" | "launchesTotal" | "focusedMsTotal";

const COLUMNS: {
  id: NumericKey;
  label: string;
  format: (n: number) => string;
}[] = [
  { id: "focusedMs7d", label: "Time · 7d", format: duration },
  { id: "launches7d", label: "Opens · 7d", format: String },
  { id: "focusedMsTotal", label: "Time · all", format: duration },
  { id: "launchesTotal", label: "Opens · all", format: String },
];

/** 42s, 12m, 3.5h — the chart kit's seconds formatter; 0 reads "—". */
function duration(ms: number): string {
  return ms === 0 ? "—" : formatValue("seconds", ms / 1000);
}

function usageFields(summary: Summary): FieldDef<ActiveApp>[] {
  // An app absent from a READY summary was never used: its counts are 0.
  // While loading there is no value at all — the cell shows the pending state.
  const rowOf = (a: ActiveApp) =>
    summary.kind === "ready" ? summary.byApp.get(a.id) : undefined;
  const known = summary.kind === "ready";
  const pendingCell = () => <Loading variant="block" className="h-3 w-8" />;
  const readError =
    summary.kind === "failed"
      ? { readError: { error: summary.error, refetch: summary.refetch } }
      : {};

  const numeric = COLUMNS.map(({ id, label, format }): FieldDef<ActiveApp> => ({
    id,
    label,
    type: "number",
    align: "end",
    value: (a) => (known ? (rowOf(a)?.[id] ?? 0) : null),
    cell: (a) => (known ? format(rowOf(a)?.[id] ?? 0) : pendingCell()),
    ...readError,
  }));
  return [
    ...numeric,
    {
      id: "lastOpenedAt",
      label: "Last opened",
      type: "date",
      value: (a) => rowOf(a)?.lastOpenedAt ?? null,
      ...(known ? {} : { cell: pendingCell }),
      ...readError,
    },
  ];
}

/**
 * The usage stats of each app, as fields of the Home grid. Always the same
 * fields in the same place: while the summary loads they exist with pending
 * cells, so the table never reflows when it lands.
 */
export function UsageFields({
  render,
}: FieldExtensionProps<ActiveApp>): ReactNode {
  const result = useAppUsageSummary();
  const summary = useMemo((): Summary => {
    switch (result.status) {
      case "loading":
        return { kind: "loading" };
      case "error":
        return {
          kind: "failed",
          error: result.error,
          refetch: result.refetch,
        };
      case "ready":
        return {
          kind: "ready",
          byApp: new Map(result.data.map((r) => [r.appId, r])),
        };
    }
  }, [result]);
  const fields = useMemo(() => usageFields(summary), [summary]);
  return <>{render(fields)}</>;
}
