import { useQuery } from "@tanstack/react-query";
import { DataTable, type ColumnDef } from "@plugins/primitives/plugins/data-table/web";
import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";
import { Spinner } from "@plugins/primitives/plugins/spinner/web";
import { SectionLabel } from "@plugins/primitives/plugins/section-label/web";

interface OutgoingFk {
  constraint_name: string;
  column_name: string;
  foreign_table: string;
  foreign_column: string;
}

interface IncomingFk {
  constraint_name: string;
  source_table: string;
  source_column: string;
  target_column: string;
}

interface ForeignKeysResponse {
  outgoing: OutgoingFk[];
  incoming: IncomingFk[];
}

const outgoingColumns: ColumnDef<OutgoingFk>[] = [
  {
    id: "constraint_name",
    header: "Constraint",
    width: "flex-1 min-w-0",
    cell: (row) => <code className="font-mono text-xs">{row.constraint_name}</code>,
    value: (row) => row.constraint_name,
  },
  {
    id: "column_name",
    header: "Column",
    width: "w-36 shrink-0",
    cell: (row) => <code className="font-mono text-xs">{row.column_name}</code>,
    value: (row) => row.column_name,
  },
  {
    id: "foreign_table",
    header: "Foreign Table",
    width: "w-40 shrink-0",
    cell: (row) => <code className="font-mono text-xs">{row.foreign_table}</code>,
    value: (row) => row.foreign_table,
  },
  {
    id: "foreign_column",
    header: "Foreign Column",
    width: "w-36 shrink-0",
    cell: (row) => <code className="font-mono text-xs">{row.foreign_column}</code>,
    value: (row) => row.foreign_column,
  },
];

const incomingColumns: ColumnDef<IncomingFk>[] = [
  {
    id: "constraint_name",
    header: "Constraint",
    width: "flex-1 min-w-0",
    cell: (row) => <code className="font-mono text-xs">{row.constraint_name}</code>,
    value: (row) => row.constraint_name,
  },
  {
    id: "source_table",
    header: "Source Table",
    width: "w-40 shrink-0",
    cell: (row) => <code className="font-mono text-xs">{row.source_table}</code>,
    value: (row) => row.source_table,
  },
  {
    id: "source_column",
    header: "Source Column",
    width: "w-36 shrink-0",
    cell: (row) => <code className="font-mono text-xs">{row.source_column}</code>,
    value: (row) => row.source_column,
  },
  {
    id: "target_column",
    header: "Target Column",
    width: "w-36 shrink-0",
    cell: (row) => <code className="font-mono text-xs">{row.target_column}</code>,
    value: (row) => row.target_column,
  },
];

export function ForeignKeysSection({
  tableName,
  pluginId: _pluginId,
}: {
  tableName: string;
  pluginId: string;
}) {
  const { data, isLoading, isError } = useQuery<ForeignKeysResponse>({
    queryKey: ["catalog-tables-foreign-keys", tableName],
    queryFn: async () => {
      const res = await fetch(
        `/api/catalog/tables/${encodeURIComponent(tableName)}/foreign-keys`,
      );
      if (!res.ok) throw new Error(`Failed to fetch FK data: ${res.status}`);
      return res.json() as Promise<ForeignKeysResponse>;
    },
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Spinner />
        Loading foreign keys…
      </div>
    );
  }

  if (isError || !data) {
    return (
      <Placeholder tone="error">Failed to load foreign keys</Placeholder>
    );
  }

  if (data.outgoing.length === 0 && data.incoming.length === 0) {
    return <Placeholder>No foreign keys</Placeholder>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <SectionLabel>References</SectionLabel>
        <DataTable
          data={data.outgoing}
          columns={outgoingColumns}
          rowKey={(row) => row.constraint_name + row.column_name}
          emptyLabel="No outgoing foreign keys"
        />
      </div>
      <div className="flex flex-col gap-2">
        <SectionLabel>Referenced by</SectionLabel>
        <DataTable
          data={data.incoming}
          columns={incomingColumns}
          rowKey={(row) => row.constraint_name + row.source_column}
          emptyLabel="No incoming foreign keys"
        />
      </div>
    </div>
  );
}
