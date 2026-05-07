import {
  ActiveDataIdentityProvider,
  useActiveDataSegments,
} from "@plugins/active-data/web";
import { FileOpenContext } from "@plugins/primitives/plugins/file-links/web";
import { WorktreeContext } from "@plugins/code-explorer/web";
import { MarkdownContent } from "@plugins/primitives/plugins/markdown/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { filePeekPane } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/shared";
import {
  formatTime,
  useRowMarkdown,
} from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";

type AssistantTextEvent = Extract<JsonlEvent, { kind: "assistant-text" }>;

export function AssistantTextRow({ event }: { event: JsonlEvent }) {
  const e = event as AssistantTextEvent;
  const { markdownMode } = useRowMarkdown();
  const { conversation } = conversationPane.useData();
  const segments = useActiveDataSegments(e.text);
  const onFileOpen = (path: string, line?: number) =>
    filePeekPane.open({
      worktree: conversation.attemptId,
      filePath: line != null ? `${path}:${line}` : path,
    });

  return (
    <div className="rounded-md border border-border/60 bg-background px-3 py-2">
      <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>Assistant</span>
        <span className="tabular-nums">{formatTime(e.at)}</span>
        <div className="ml-auto flex items-center gap-2">
          {e.stopReason ? (
            <span className="text-muted-foreground/70">{e.stopReason}</span>
          ) : null}
        </div>
      </div>
      {markdownMode ? (
        <WorktreeContext.Provider value={conversation.attemptId}>
          <FileOpenContext.Provider value={onFileOpen}>
            <div className="text-sm leading-6">
              {(() => {
                const counts = new Map<string, number>();
                return segments.map((seg, i) => {
                  if (seg.type !== "block") {
                    return (
                      <MarkdownContent key={i} text={seg.text} />
                    );
                  }
                  const idx = counts.get(seg.tag) ?? 0;
                  counts.set(seg.tag, idx + 1);
                  const block = (
                    <seg.component content={seg.content} attrs={seg.attrs} />
                  );
                  if (!e.messageId) return <span key={i}>{block}</span>;
                  return (
                    <ActiveDataIdentityProvider
                      key={i}
                      conversationId={conversation.id}
                      messageId={e.messageId}
                      tag={seg.tag}
                      occurrenceIndex={idx}
                    >
                      {block}
                    </ActiveDataIdentityProvider>
                  );
                });
              })()}
            </div>
          </FileOpenContext.Provider>
        </WorktreeContext.Provider>
      ) : (
        <div className="whitespace-pre-wrap break-words text-sm">{e.text}</div>
      )}
    </div>
  );
}
