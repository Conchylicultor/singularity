import type { JsonlEvent } from "../../../../shared";
import { formatTime } from "../../../../web/utils";

type UserTextEvent = Extract<JsonlEvent, { kind: "user-text" }>;

export function UserTextRow({ event }: { event: JsonlEvent }) {
  const e = event as UserTextEvent;
  return (
    <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2">
      <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>User</span>
        <span className="tabular-nums">{formatTime(e.at)}</span>
      </div>
      <div className="whitespace-pre-wrap break-words text-sm">{e.text}</div>
    </div>
  );
}
