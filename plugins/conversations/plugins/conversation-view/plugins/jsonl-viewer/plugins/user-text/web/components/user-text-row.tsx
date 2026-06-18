import { useState } from "react";
import { InlineText } from "@plugins/primitives/plugins/inline-text/web";
import type { JsonlEvent, UserTextSegment } from "@plugins/conversations/plugins/transcript-watcher/core";
import { RowActions, useStickyReport } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { ContentScope } from "@plugins/primitives/plugins/select-scope/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Expandable } from "@plugins/primitives/plugins/expandable/web";

type UserTextEvent = Extract<JsonlEvent, { kind: "user-text" }>;

function InlineImage({ mime, data }: { mime: string; data: string }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      className="block max-w-full"
      aria-label={expanded ? "Collapse image" : "Expand image"}
    >
      <img
        src={`data:${mime};base64,${data}`}
        alt="Attached image"
        className={
          expanded
            ? "max-h-[80vh] max-w-full rounded-md border border-border object-contain"
            : "max-h-40 max-w-xs rounded-md border border-border object-cover"
        }
      />
    </button>
  );
}

function SegmentedContent({ segments }: { segments: UserTextSegment[] }) {
  return (
    <>
      {segments.map((seg, i) =>
        seg.kind === "text" ? (
          <Text as="div" variant="body" key={i} className="whitespace-pre-wrap break-words">
            <InlineText text={seg.value} />
          </Text>
        ) : (
          // eslint-disable-next-line spacing/no-adhoc-spacing -- mt-1.5 spaces an inline image segment from the preceding text segment
          <div key={i} className="mt-1.5">
            <InlineImage mime={seg.mime} data={seg.data} />
          </div>
        ),
      )}
    </>
  );
}

export function UserTextRow({ event }: { event: JsonlEvent }) {
  const e = event as UserTextEvent;
  const reportSticky = useStickyReport();

  const body = e.segments ? (
    <SegmentedContent segments={e.segments} />
  ) : (
    <Text as="div" variant="body" className="whitespace-pre-wrap break-words">
      <InlineText text={e.text} />
    </Text>
  );

  return (
    <ContentScope>
      <div className="relative rounded-md border border-border/60 bg-background px-md py-sm">
        <Pin to="top-right" offset="sm">
          <RowActions floating />
        </Pin>
        <Expandable onToggle={reportSticky}>{body}</Expandable>
      </div>
    </ContentScope>
  );
}
