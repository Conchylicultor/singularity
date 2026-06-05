import { useQuery } from "@tanstack/react-query";
import { DataTable, type ColumnDef } from "@plugins/primitives/plugins/data-table/web";
import { Spinner } from "@plugins/primitives/plugins/spinner/web";
import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";

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
  const { data, isLoading, isError } = useQuery<{ indexes: IndexRow[] }>({
    queryKey: ["catalog-table-indexes", tableName],
    queryFn: async () => {
      const res = await fetch(
        `/api/catalog/tables/${encodeURIComponent(tableName)}/indexes`,
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{ indexes: IndexRow[] }>;
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Spinner />
        Loading indexes…
      </div>
    );
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
