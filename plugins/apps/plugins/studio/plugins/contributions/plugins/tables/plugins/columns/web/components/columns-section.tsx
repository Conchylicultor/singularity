import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { getTableColumns } from "../../shared/endpoints";
import { DataTable, type ColumnDef } from "@plugins/primitives/plugins/data-table/web";
import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";

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
    width: "2rem",
    value: (row) => row.ordinal_position,
  },
  {
    id: "column_name",
    header: "Column",
    width: "12rem",
    cell: (row) => <code className="font-mono">{row.column_name}</code>,
  },
  {
    id: "data_type",
    header: "Type",
    width: "minmax(0,1fr)",
    value: (row) => row.data_type,
  },
  {
    id: "is_nullable",
    header: "Nullable",
    width: "5rem",
    value: (row) => row.is_nullable,
  },
  {
    id: "column_default",
    header: "Default",
    width: "12rem",
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
  const { data, isPending, isError } = useEndpoint(getTableColumns, { tableName }, { staleTime: 60_000 });

  if (isPending) {
    return <Loading variant="spinner" label="Loading columns…" />;
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
