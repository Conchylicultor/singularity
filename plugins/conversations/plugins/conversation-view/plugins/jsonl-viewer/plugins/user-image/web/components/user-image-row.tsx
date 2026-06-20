import { useState } from "react";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { RowActions } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { SectionLabel } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";

type UserImageEvent = Extract<JsonlEvent, { kind: "user-image" }>;

export function UserImageRow({ event }: { event: JsonlEvent }) {
  const e = event as UserImageEvent;
  const [expanded, setExpanded] = useState(false);
  const src = `data:${e.mime};base64,${e.data}`;
  return (
    <div className="relative rounded-md border border-border/60 bg-background px-md py-sm">
      <Pin to="top-right" offset="sm">
        <RowActions floating />
      </Pin>
      {/* eslint-disable-next-line spacing/no-adhoc-spacing -- mb-1 spaces the label from the image below it */}
      <SectionLabel className="mb-1 text-3xs">
        <Stack direction="row" gap="sm" align="center">
          <span>User image</span>
          <span>{e.mime}</span>
        </Stack>
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
              ? "max-h-[80vh] max-w-full rounded-md border border-border object-contain"
              : "max-h-32 max-w-xs rounded-md border border-border object-cover"
          }
        />
      </button>
    </div>
  );
}
