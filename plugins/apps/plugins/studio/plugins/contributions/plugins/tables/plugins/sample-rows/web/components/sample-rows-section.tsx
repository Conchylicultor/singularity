import { useMemo } from "react";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { getTableSampleRows } from "../../shared/endpoints";
import { DataTable, type ColumnDef } from "@plugins/primitives/plugins/data-table/web";
import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";
import { Spinner } from "@plugins/primitives/plugins/spinner/web";
import { Text } from "@plugins/primitives/plugins/text/web";

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
    return (
      <Text as="div" variant="body" className="flex items-center gap-2 text-muted-foreground">
        <Spinner />
        Loading sample rows…
      </Text>
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
