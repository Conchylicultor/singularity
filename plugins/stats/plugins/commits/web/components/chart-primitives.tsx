import { useEffect, useState } from "react";
import { CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { fetchWithRetry } from "@core";

export function useFetchJson<T>(url: string): {
  data: T | null;
  error: string | null;
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    fetchWithRetry(url)
      .then((r) => r.json())
      .then((d: T) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [url]);
  return { data, error };
}

export function ChartState({
  error,
  empty,
  loading,
  children,
}: {
  error: string | null;
  empty: boolean;
  loading: boolean;
  children: React.ReactNode;
}) {
  if (error) return <div className="text-destructive text-sm">Failed to load: {error}</div>;
  if (loading) return <div className="text-muted-foreground text-sm">Loading…</div>;
  if (empty) return <div className="text-muted-foreground text-sm">No commits yet.</div>;
  return <>{children}</>;
}

const axisProps = {
  stroke: "var(--muted-foreground)",
  tick: { fontSize: 11 },
} as const;

export function ThemedXAxis(props: { dataKey: string }) {
  return <XAxis dataKey={props.dataKey} {...axisProps} minTickGap={32} />;
}

export function ThemedYAxis() {
  return <YAxis {...axisProps} allowDecimals={false} />;
}

export function ThemedGrid() {
  return <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />;
}

export function ThemedTooltip({ cursorFill }: { cursorFill?: boolean } = {}) {
  return (
    <Tooltip
      contentStyle={{
        background: "var(--popover)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        color: "var(--popover-foreground)",
        fontSize: 12,
      }}
      labelStyle={{ color: "var(--foreground)" }}
      {...(cursorFill ? { cursor: { fill: "var(--muted)", opacity: 0.3 } } : {})}
    />
  );
}
