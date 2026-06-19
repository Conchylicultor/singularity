import { useMemo } from "react";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { getTableSampleRows } from "../../shared/endpoints";
import { DataTable, type ColumnDef } from "@plugins/primitives/plugins/data-table/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";

export function SampleRowsSection({
  tableName,
}: {
  tableName: string;
  pluginId: string;
}) {
  const { data, isLoading, isError } = useEndpoint(getTableSampleRows, { tableName }, { staleTime: 60_000 });

  const columns: ColumnDef<Record<string, unknown>>[] = useMemo(
    () =>
      (data?.columns ?? []).map((col) => ({
        id: col,
        header: col,
        width: "minmax(120px,200px)",
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
    return <Loading variant="spinner" label="Loading sample rows…" />;
  }

  if (isError) {
    return <Placeholder tone="error">Failed to load sample rows.</Placeholder>;
  }

  return (
    <Scroll axis="x">
      <DataTable
        data={data?.rows ?? []}
        columns={columns}
        rowKey={(_row, index) => String(index)}
        emptyLabel="No rows"
      />
    </Scroll>
  );
}
