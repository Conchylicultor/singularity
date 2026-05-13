import { useState } from "react";
import { SectionLabel } from "@plugins/primitives/plugins/section-label/web";
import { MdExpandLess, MdExpandMore } from "react-icons/md";
import { FileLinkText } from "@plugins/primitives/plugins/file-links/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { filePeekPane } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";
import type { JsonlEvent, UserTextSegment } from "@plugins/conversations/plugins/transcript-watcher/core";
import { formatTime } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";

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
            ? "max-h-[80vh] max-w-full rounded border border-border object-contain"
            : "max-h-40 max-w-xs rounded border border-border object-cover"
        }
      />
    </button>
  );
}

function SegmentedContent({
  segments,
  onFileOpen,
}: {
  segments: UserTextSegment[];
  onFileOpen: (path: string) => void;
}) {
  return (
    <>
      {segments.map((seg, i) =>
        seg.kind === "text" ? (
          <div key={i} className="whitespace-pre-wrap break-words text-sm">
            <FileLinkText text={seg.value} onFileOpen={onFileOpen} />
          </div>
        ) : (
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
  const { conversation } = conversationPane.useData();
  const openPane = useOpenPane();
  const collapsible = isLong(e.text);
  const [expanded, setExpanded] = useState(false);
  const showCollapsed = collapsible && !expanded;

  const onFileOpen = (path: string) =>
    openPane(filePeekPane, {
      worktree: conversation.attemptId,
      filePath: path,
    }, { mode: "push" });

  return (
    <div className="rounded-md border border-border/60 bg-muted/40 px-3 py-2">
      <SectionLabel className="mb-1 flex items-center gap-2 text-[10px]">
        <span>User</span>
        <span className="tabular-nums">{formatTime(e.at)}</span>
      </SectionLabel>
      <div
        className={showCollapsed ? "max-h-48 overflow-hidden" : ""}
        style={showCollapsed ? { maskImage: FADE_MASK, WebkitMaskImage: FADE_MASK } : undefined}
      >
        {e.segments ? (
          <SegmentedContent segments={e.segments} onFileOpen={onFileOpen} />
        ) : (
          <div className="whitespace-pre-wrap break-words text-sm">
            <FileLinkText text={e.text} onFileOpen={onFileOpen} />
          </div>
        )}
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
