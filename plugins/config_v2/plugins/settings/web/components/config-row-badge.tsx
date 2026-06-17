import { MdWarning } from "react-icons/md";
import type { ConfigSource } from "@plugins/config_v2/core";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";

/** Source → short tag label. `manual` (and missing) carries no tag — only the
 * auto-generated provenances are worth surfacing. */
const SOURCE_LABEL: Partial<Record<ConfigSource, string>> = {
  reorder: "Reorder",
  view: "View",
};

/**
 * Trailing indicator for a config row: an optional auto-generated source tag,
 * followed by a conflict warning or a modified-field count badge.
 */
export function ConfigRowBadge({
  modifiedCount,
  hasConflict,
  source,
}: {
  modifiedCount: number;
  hasConflict: boolean;
  source?: ConfigSource;
}) {
  const sourceLabel = source ? SOURCE_LABEL[source] : undefined;
  const sourceTag = sourceLabel ? (
    // eslint-disable-next-line spacing/no-adhoc-spacing -- trailing row indicator offset from the row label
    <Badge variant="muted" size="sm" shape="pill" className="ml-2">
      {sourceLabel}
    </Badge>
  ) : null;

  const indicator = hasConflict ? (
    // eslint-disable-next-line spacing/no-adhoc-spacing -- trailing row indicator offset from the row label
    <MdWarning className="ml-2 size-4 shrink-0 text-warning" />
  ) : modifiedCount > 0 ? (
    // eslint-disable-next-line spacing/no-adhoc-spacing -- trailing row indicator offset from the row label
    <span className="ml-2 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-3xs font-medium text-primary-foreground">
      {modifiedCount}
    </span>
  ) : null;

  if (!sourceTag && !indicator) return null;
  return (
    <>
      {sourceTag}
      {indicator}
    </>
  );
}
