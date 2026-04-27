import { useState } from "react";
import { MdExpandLess, MdExpandMore } from "react-icons/md";
import type { JsonlEvent } from "../../../../shared";
import { formatTime } from "../../../../web/utils";

type UserTextEvent = Extract<JsonlEvent, { kind: "user-text" }>;

const COLLAPSE_CHAR_THRESHOLD = 800;
const COLLAPSE_LINE_THRESHOLD = 14;

function isLong(text: string): boolean {
  if (text.length > COLLAPSE_CHAR_THRESHOLD) return true;
  let lines = 1;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10 && ++lines > COLLAPSE_LINE_THRESHOLD) return true;
  }
  return false;
}

const FADE_MASK = "linear-gradient(to bottom, black 65%, transparent 100%)";

export function UserTextRow({ event }: { event: JsonlEvent }) {
  const e = event as UserTextEvent;
  const collapsible = isLong(e.text);
  const [expanded, setExpanded] = useState(false);
  const showCollapsed = collapsible && !expanded;

  return (
    <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2">
      <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>User</span>
        <span className="tabular-nums">{formatTime(e.at)}</span>
      </div>
      <div
        className={`whitespace-pre-wrap break-words text-sm ${
          showCollapsed ? "max-h-48 overflow-hidden" : ""
        }`}
        style={
          showCollapsed
            ? { maskImage: FADE_MASK, WebkitMaskImage: FADE_MASK }
            : undefined
        }
      >
        {e.text}
      </div>
      {collapsible ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          {expanded ? (
            <>
              <MdExpandLess className="size-3.5" />
              Show less
            </>
          ) : (
            <>
              <MdExpandMore className="size-3.5" />
              Show more
            </>
          )}
        </button>
      ) : null}
    </div>
  );
}
