import { useQuery } from "@tanstack/react-query";
import { DataTable, type ColumnDef } from "@plugins/primitives/plugins/data-table/web";
import { Spinner } from "@plugins/primitives/plugins/spinner/web";
import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";

interface ColumnRow {
  column_name: string;
  data_type: string;
  is_nullable: string;
  column_default: string | null;
  ordinal_position: number;
}

const columns: ColumnDef<ColumnRow>[] = [
  {
    id: "ordinal_position",
    header: "#",
    width: "w-8 shrink-0",
    value: (row) => row.ordinal_position,
  },
  {
    id: "column_name",
    header: "Column",
    width: "w-48 shrink-0",
    cell: (row) => <code className="font-mono">{row.column_name}</code>,
  },
  {
    id: "data_type",
    header: "Type",
    width: "flex-1 min-w-0",
    value: (row) => row.data_type,
  },
  {
    id: "is_nullable",
    header: "Nullable",
    width: "w-20 shrink-0",
    value: (row) => row.is_nullable,
  },
  {
    id: "column_default",
    header: "Default",
    width: "w-48 shrink-0",
    cell: (row) =>
      row.column_default != null ? (
        <code className="font-mono text-muted-foreground">
          {row.column_default}
        </code>
      ) : null,
  },
];

export function ColumnsSection({
  tableName,
}: {
  tableName: string;
  pluginId: string;
}) {
  const { data, isPending, isError } = useQuery<{ columns: ColumnRow[] }>({
    queryKey: ["catalog-table-columns", tableName],
    queryFn: async () => {
      const res = await fetch(
        `/api/catalog/tables/${encodeURIComponent(tableName)}/columns`,
      );
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<{ columns: ColumnRow[] }>;
    },
    staleTime: 60_000,
  });

  if (isPending) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
        <Spinner />
        Loading columns…
      </div>
    );
  }

  if (isError) {
    return <Placeholder tone="error">Failed to load columns.</Placeholder>;
  }

  return (
    <DataTable
      data={data.columns}
      columns={columns}
      rowKey={(row) => String(row.ordinal_position)}
    />
  );
}
