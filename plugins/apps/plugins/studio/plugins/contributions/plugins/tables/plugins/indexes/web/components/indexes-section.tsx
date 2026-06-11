import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { getTableIndexes } from "../../shared/endpoints";
import { DataTable, type ColumnDef } from "@plugins/primitives/plugins/data-table/web";
import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";

interface IndexRow {
  indexname: string;
  indexdef: string;
}

const columns: ColumnDef<IndexRow>[] = [
  {
    id: "name",
    header: "Name",
    width: "14rem",
    value: (row) => row.indexname,
    cell: (row) => <code className="font-mono">{row.indexname}</code>,
  },
  {
    id: "definition",
    header: "Definition",
    width: "minmax(0,1fr)",
    value: (row) => row.indexdef,
    cell: (row) => (
      <code className="break-all font-mono text-muted-foreground">
        {row.indexdef}
      </code>
    ),
  },
];

export function IndexesSection({
  tableName,
}: {
  tableName: string;
  pluginId: string;
}) {
  const { data, isLoading, isError } = useEndpoint(getTableIndexes, { tableName }, { staleTime: 60_000 });

  if (isLoading) {
    return <Loading variant="spinner" label="Loading indexes…" />;
  }

  if (isError) {
    return <Placeholder tone="error">Failed to load indexes.</Placeholder>;
  }

  return (
    <DataTable
      data={data?.indexes ?? []}
      columns={columns}
      rowKey={(row) => row.indexname}
      emptyLabel="No indexes found"
    />
  );
}
