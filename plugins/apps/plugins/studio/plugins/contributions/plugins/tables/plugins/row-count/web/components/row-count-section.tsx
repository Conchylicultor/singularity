import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { getTableRowCount } from "../../shared/endpoints";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";

/**
 * One number — so it rides the section header as `summary` rather than sitting
 * behind a chevron.
 */
export function RowCountSummary({
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
    <Inline gap="xs">
      <Text as="span" variant="body" className="tabular-nums">
        {data.estimate != null ? data.estimate.toLocaleString() : "—"}
      </Text>
      <Text as="span" variant="caption" tone="muted">rows (est.)</Text>
    </Inline>
  );
}
