import { RelativeTime } from "@plugins/primitives/plugins/relative-time/web";
import { formatAbsoluteTime } from "../utils";

export function Timestamp({ at, className }: { at: string; className?: string }) {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return null;
  return (
    <span title={formatAbsoluteTime(date)}>
      <RelativeTime date={date} className={className} />
    </span>
  );
}
