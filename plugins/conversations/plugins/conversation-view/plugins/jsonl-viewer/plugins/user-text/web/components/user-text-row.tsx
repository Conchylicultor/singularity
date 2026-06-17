import { useState } from "react";
import { MdExpandLess, MdExpandMore } from "react-icons/md";
import { InlineText } from "@plugins/primitives/plugins/inline-text/web";
import type { JsonlEvent, UserTextSegment } from "@plugins/conversations/plugins/transcript-watcher/core";
import { RowActions, useStickyReport } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { ContentScope } from "@plugins/primitives/plugins/select-scope/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

type UserTextEvent = Extract<JsonlEvent, { kind: "user-text" }>;

const COLLAPSE_CHAR_THRESHOLD = 800;
const COLLAPSE_LINE_THRESHOLD = 14;
const LINES_PER_IMAGE = 8;

function isLong(text: string, imageCount = 0): boolean {
  if (text.length > COLLAPSE_CHAR_THRESHOLD) return true;
  let lines = 1 + imageCount * LINES_PER_IMAGE;
  if (lines > COLLAPSE_LINE_THRESHOLD) return true;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) === 10 && ++lines > COLLAPSE_LINE_THRESHOLD) return true;
  }
  return false;
}

const FADE_MASK = "linear-gradient(to bottom, black 65%, transparent 100%)";

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
  const imageCount = e.segments?.filter((s) => s.kind !== "text").length ?? 0;
  const collapsible = isLong(e.text, imageCount);
  const [expanded, setExpanded] = useState(false);
  const reportSticky = useStickyReport();
  const showCollapsed = collapsible && !expanded;

  return (
    <ContentScope>
      <div className="relative rounded-md border border-border/60 bg-background px-md py-sm">
        <RowActions floating className="absolute right-2 top-2 z-raised" />
        <div
          className={showCollapsed ? "max-h-48 overflow-hidden" : ""}
          style={showCollapsed ? { maskImage: FADE_MASK, WebkitMaskImage: FADE_MASK } : undefined}
        >
          {e.segments ? (
            <SegmentedContent segments={e.segments} />
          ) : (
            <Text as="div" variant="body" className="whitespace-pre-wrap break-words">
              <InlineText text={e.text} />
            </Text>
          )}
        </div>
        {collapsible ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => { const next = !v; reportSticky(next); return next; })}
            // eslint-disable-next-line spacing/no-adhoc-spacing -- mt-1 spaces the show-more toggle from the content above it
            className="text-caption mt-1 flex items-center gap-xs text-muted-foreground hover:text-foreground"
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
    </ContentScope>
  );
}
