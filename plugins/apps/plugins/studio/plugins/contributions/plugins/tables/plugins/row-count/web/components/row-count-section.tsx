import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { getTableRowCount } from "../../shared/endpoints";
import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";

export function RowCountSection({
  tableName,
}: {
  tableName: string;
  pluginId: string;
}) {
  const { data, isPending, isError } = useEndpoint(getTableRowCount, { tableName }, { staleTime: 60_000 });

  if (isPending) {
    return <Loading variant="spinner" label="Loading…" />;
  }

  if (isError) {
    return <Placeholder tone="error">Failed to load row count.</Placeholder>;
  }

  return (
    <div className="flex items-baseline gap-2 px-3 py-2">
      <Text variant="title" className="tabular-nums">
        {data.estimate != null ? data.estimate.toLocaleString() : "—"}
      </Text>
      <Text variant="body" className="text-muted-foreground">rows (estimated)</Text>
    </div>
  );
}
