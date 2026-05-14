import { useQuery } from "@tanstack/react-query";
import { Spinner } from "@plugins/primitives/plugins/spinner/web";
import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";

interface RowCountResponse {
  estimate: number | null;
}

export function RowCountSection({
  tableName,
}: {
  tableName: string;
  pluginId: string;
}) {
  const { data, isPending, isError } = useQuery<RowCountResponse>({
    queryKey: ["catalog-table-row-count", tableName],
    queryFn: async () => {
      const res = await fetch(
        `/api/catalog/tables/${encodeURIComponent(tableName)}/row-count`,
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<RowCountResponse>;
    },
    staleTime: 60_000,
  });

  if (isPending) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
        <Spinner />
        Loading…
      </div>
    );
  }

  if (isError) {
    return <Placeholder tone="error">Failed to load row count.</Placeholder>;
  }

  return (
    <div className="flex items-baseline gap-2 px-3 py-2">
      <span className="text-2xl font-semibold tabular-nums">
        {data.estimate != null ? data.estimate.toLocaleString() : "—"}
      </span>
      <span className="text-sm text-muted-foreground">rows (estimated)</span>
    </div>
  );
}
