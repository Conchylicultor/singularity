import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { getTableRowCount } from "../../shared/endpoints";
import { Spinner } from "@plugins/primitives/plugins/spinner/web";
import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";
import { Text } from "@plugins/primitives/plugins/text/web";

export function RowCountSection({
  tableName,
}: {
  tableName: string;
  pluginId: string;
}) {
  const { data, isPending, isError } = useEndpoint(getTableRowCount, { tableName }, { staleTime: 60_000 });

  if (isPending) {
    return (
      <Text as="div" variant="body" className="flex items-center gap-2 px-3 py-2 text-muted-foreground">
        <Spinner />
        Loading…
      </Text>
    );
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
