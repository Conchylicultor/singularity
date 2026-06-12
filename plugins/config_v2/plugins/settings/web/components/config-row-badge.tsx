import { MdWarning } from "react-icons/md";

/**
 * Trailing indicator for a config row: a conflict warning, a modified-field
 * count badge, or nothing.
 */
export function ConfigRowBadge({
  modifiedCount,
  hasConflict,
}: {
  modifiedCount: number;
  hasConflict: boolean;
}) {
  if (hasConflict) {
    // eslint-disable-next-line spacing/no-adhoc-spacing -- trailing row indicator offset from the row label
    return <MdWarning className="ml-2 size-4 shrink-0 text-warning" />;
  }
  if (modifiedCount > 0) {
    return (
      // eslint-disable-next-line spacing/no-adhoc-spacing -- trailing row indicator offset from the row label
      <span className="ml-2 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-3xs font-medium text-primary-foreground">
        {modifiedCount}
      </span>
    );
  }
  return null;
}
