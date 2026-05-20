import {
  ActiveDataIdentityProvider,
  useActiveDataSegments,
} from "@plugins/active-data/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import {
  JsonlViewer,
  useRowMarkdown,
} from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/web";
import { Markdown } from "@plugins/primitives/plugins/markdown/web";
import { ContentScope } from "@plugins/primitives/plugins/select-scope/web";

type AssistantTextEvent = Extract<JsonlEvent, { kind: "assistant-text" }>;

export function AssistantTextRow({ event }: { event: JsonlEvent }) {
  const e = event as AssistantTextEvent;
  const { markdownMode } = useRowMarkdown();
  const { conversation } = conversationPane.useData();
  const segments = useActiveDataSegments(e.text);

  return (
    <ContentScope>
      <div className="px-3 py-2">
        {markdownMode ? (
          <div className="text-sm leading-6">
            {(() => {
              const counts = new Map<string, number>();
              return segments.map((seg, i) => {
                if (seg.type !== "block") {
                  return <Markdown key={i}>{seg.text}</Markdown>;
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
        ) : (
          <div className="whitespace-pre-wrap break-words text-sm">{e.text}</div>
        )}
      </div>
      <div className="flex items-center gap-1.5 px-1 pt-1 opacity-0 transition-opacity group-hover/row:opacity-100 focus-within:opacity-100">
        <JsonlViewer.RowAction.Render>
          {(item) => <item.component event={e} />}
        </JsonlViewer.RowAction.Render>
      </div>
    </ContentScope>
  );
}
