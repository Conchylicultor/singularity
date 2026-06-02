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
    return <MdWarning className="ml-2 size-4 shrink-0 text-warning" />;
  }
  if (modifiedCount > 0) {
    return (
      <span className="ml-2 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
        {modifiedCount}
      </span>
    );
  }
  return null;
}
