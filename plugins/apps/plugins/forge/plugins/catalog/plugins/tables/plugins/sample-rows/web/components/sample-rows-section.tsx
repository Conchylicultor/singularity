import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { DataTable, type ColumnDef } from "@plugins/primitives/plugins/data-table/web";
import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";
import { Spinner } from "@plugins/primitives/plugins/spinner/web";

interface SampleRowsResponse {
  columns: string[];
  rows: Record<string, unknown>[];
}

export function SampleRowsSection({
  tableName,
}: {
  tableName: string;
  pluginId: string;
}) {
  const { data, isLoading, isError } = useQuery<SampleRowsResponse>({
    queryKey: ["catalog-tables-sample-rows", tableName],
    queryFn: async () => {
      const res = await fetch(
        `/api/catalog/tables/${encodeURIComponent(tableName)}/sample`,
      );
      if (!res.ok) throw new Error(`Failed to fetch sample rows: ${res.status}`);
      return res.json() as Promise<SampleRowsResponse>;
    },
    staleTime: 60_000,
  });

  const columns: ColumnDef<Record<string, unknown>>[] = useMemo(
    () =>
      (data?.columns ?? []).map((col) => ({
        id: col,
        header: col,
        width: "min-w-[120px] max-w-[200px] shrink-0",
        cell: (row: Record<string, unknown>) =>
          row[col] === null ? (
            <span className="italic text-muted-foreground">null</span>
          ) : (
            <span className="font-mono">{String(row[col])}</span>
          ),
      })),
    [data?.columns],
  );

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        Loading sample rows…
      </div>
    );
  }

  if (isError) {
    return <Placeholder tone="error">Failed to load sample rows.</Placeholder>;
  }

  return (
    <div className="overflow-x-auto">
      <DataTable
        data={data?.rows ?? []}
        columns={columns}
        rowKey={(_row, index) => String(index)}
        emptyLabel="No rows"
      />
    </div>
  );
}
