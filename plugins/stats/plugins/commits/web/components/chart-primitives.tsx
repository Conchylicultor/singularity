import { useEffect, useState } from "react";
import { fetchWithRetry } from "@plugins/primitives/plugins/networking/web";

export function useFetchJson<T>(url: string, cacheKey?: string): {
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
  }, [url, cacheKey]);
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

export const axisProps = {
  stroke: "var(--muted-foreground)",
  tick: { fontSize: 11 },
} as const;

const compactFormatter = new Intl.NumberFormat(undefined, {
  notation: "compact",
  maximumFractionDigits: 1,
});
export const yAxisFormatter = (v: number) => compactFormatter.format(v);

const numberFormatter = new Intl.NumberFormat();
export const tooltipNumberFormatter = (v: number) => numberFormatter.format(v);

export const tooltipContentStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 6,
  color: "var(--popover-foreground)",
  fontSize: 12,
} as const;

export const tooltipLabelStyle = {
  color: "var(--foreground)",
  fontWeight: 500,
} as const;

export const lineCursor = {
  stroke: "var(--muted-foreground)",
  strokeDasharray: "3 3" as const,
};

export const barCursor = { fill: "var(--muted)", opacity: 0.3 };

export const gridProps = {
  strokeDasharray: "3 3",
  stroke: "var(--border)",
} as const;
