import { useState } from "react";
import { MdExpandLess, MdExpandMore } from "react-icons/md";
import { FileLinkText } from "@plugins/primitives/plugins/file-links/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { filePeekPane } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";
import type { JsonlEvent, UserTextSegment } from "@plugins/conversations/plugins/transcript-watcher/core";
import { useStickyReport } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { ContentScope } from "@plugins/primitives/plugins/select-scope/web";
import { Text } from "@plugins/primitives/plugins/text/web";

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
          <Text as="div" variant="body" key={i} className="whitespace-pre-wrap break-words">
            <FileLinkText text={seg.value} onFileOpen={onFileOpen} />
          </Text>
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
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  const openPane = useOpenPane();
  const imageCount = e.segments?.filter((s) => s.kind !== "text").length ?? 0;
  const collapsible = isLong(e.text, imageCount);
  const [expanded, setExpanded] = useState(false);
  const reportSticky = useStickyReport();
  const showCollapsed = collapsible && !expanded;

  if (!conversation) return null;

  const onFileOpen = (path: string) =>
    openPane(filePeekPane, {
      worktree: conversation.attemptId,
      filePath: path,
    }, { mode: "push" });

  return (
    <ContentScope>
      <div className="rounded-md border border-border/60 bg-background px-3 py-2">
        <div
          className={showCollapsed ? "max-h-48 overflow-hidden" : ""}
          style={showCollapsed ? { maskImage: FADE_MASK, WebkitMaskImage: FADE_MASK } : undefined}
        >
          {e.segments ? (
            <SegmentedContent segments={e.segments} onFileOpen={onFileOpen} />
          ) : (
            <Text as="div" variant="body" className="whitespace-pre-wrap break-words">
              <FileLinkText text={e.text} onFileOpen={onFileOpen} />
            </Text>
          )}
        </div>
        {collapsible ? (
          <button
            type="button"
            onClick={() => setExpanded((v) => { const next = !v; reportSticky(next); return next; })}
            className="text-caption mt-1 flex items-center gap-1 text-muted-foreground hover:text-foreground"
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
