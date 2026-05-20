import { useState } from "react";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { SectionLabel } from "@plugins/primitives/plugins/section-label/web";
import { Timestamp } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";

type UserImageEvent = Extract<JsonlEvent, { kind: "user-image" }>;

export function UserImageRow({ event }: { event: JsonlEvent }) {
  const e = event as UserImageEvent;
  const [expanded, setExpanded] = useState(false);
  const src = `data:${e.mime};base64,${e.data}`;
  return (
    <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2">
      <SectionLabel className="mb-1 flex items-center gap-2 text-[10px]">
        <span>User image</span>
        <Timestamp at={e.at} className="tabular-nums" />
        <span>{e.mime}</span>
      </SectionLabel>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="block max-w-full"
        aria-label={expanded ? "Collapse image" : "Expand image"}
      >
        <img
          src={src}
          alt="User-pasted image"
          className={
            expanded
              ? "max-h-[80vh] max-w-full rounded border border-border object-contain"
              : "max-h-32 max-w-xs rounded border border-border object-cover"
          }
        />
      </button>
    </div>
  );
}
