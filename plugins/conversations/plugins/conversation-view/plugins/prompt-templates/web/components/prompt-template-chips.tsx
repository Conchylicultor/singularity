import { useState, useMemo } from "react";
import { MdEdit, MdSend } from "react-icons/md";
import {
  FloatingAction,
  FloatingActionFadeIn,
} from "@plugins/primitives/plugins/floating-action/web";
import { ResponsiveOverflow } from "@plugins/primitives/plugins/responsive-overflow/web";
import type { PromptEditorActionProps } from "@plugins/primitives/plugins/prompt-editor/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversation, useConversationById } from "@plugins/conversations/web";
import { postConversationTurn } from "@plugins/conversations/core";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { toast } from "@plugins/notifications/web";
import { useConfig } from "@plugins/config_v2/web";
import { promptTemplatesConfig } from "../../shared/config";

interface TemplateItem {
  id: string;
  title: string;
  prompt: string;
}

function applyTemplate(
  t: TemplateItem,
  insertText: (text: string) => void,
) {
  insertText(t.prompt);
}

function TemplateChip({
  template,
  insertText,
  pinned,
  onSend,
  canSend,
  sending,
}: {
  template: TemplateItem;
  insertText: (text: string) => void;
  pinned?: boolean;
  onSend: (t: TemplateItem) => void;
  canSend: boolean;
  sending: boolean;
}) {
  return (
    <div
      className={`inline-flex items-center h-6 rounded-full border border-input bg-background text-xs${pinned ? "" : " border-dashed"}`}
    >
      <button
        type="button"
        className="flex items-center gap-1 pl-2 pr-1.5 h-full rounded-l-full hover:bg-accent hover:text-accent-foreground transition-colors"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => applyTemplate(template, insertText)}
      >
        <MdEdit className="size-3 shrink-0" />
        <span>{template.title}</span>
      </button>
      <div className="w-px h-3 bg-border" />
      <button
        type="button"
        className={`flex items-center px-1.5 h-full rounded-r-full transition-colors${
          canSend && !sending
            ? " hover:bg-accent text-muted-foreground hover:text-accent-foreground"
            : " text-muted-foreground/30 cursor-default"
        }`}
        onMouseDown={(e) => e.preventDefault()}
        disabled={!canSend || sending}
        onClick={() => onSend(template)}
      >
        <MdSend className="size-3 shrink-0" />
      </button>
    </div>
  );
}

export function FloatingTemplateChips({
  insertText,
  getContent,
  clearContent,
}: PromptEditorActionProps) {
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  const live = useConversation(convId) ?? conversation;
  const { templates, pinnedCount } = useConfig(promptTemplatesConfig);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const canSend = live?.status === "waiting" && sendingId === null;

  const pinnedTemplates = useMemo(
    () => templates.slice(0, pinnedCount),
    [templates, pinnedCount],
  );

  async function sendTemplate(t: TemplateItem) {
    if (!canSend) return;
    setSendingId(t.id);
    try {
      const existing = getContent().trim();
      const text = existing ? `${t.prompt}\n\n${existing}` : t.prompt;
      await fetchEndpoint(postConversationTurn, { id: convId }, { body: { text } });
      clearContent();
    } catch (err) {
      toast({
        type: "conversation",
        description: `Failed to send: ${err instanceof Error ? err.message : String(err)}`,
        variant: "error",
      });
    } finally {
      setSendingId(null);
    }
  }

  if (templates.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5">
      {pinnedTemplates.length > 0 && (
        <ResponsiveOverflow gap={4} className="items-center">
          {pinnedTemplates.map((t) => (
            <TemplateChip
              key={t.id}
              template={t}
              insertText={insertText}
              pinned
              onSend={(tpl) => void sendTemplate(tpl)}
              canSend={canSend}
              sending={sendingId === t.id}
            />
          ))}
        </ResponsiveOverflow>
      )}
      <FloatingAction
        variant="ghost"
        panelClassName="flex-col-reverse items-end gap-1 p-1 group-data-hovered/fa:px-1.5 max-w-7 group-data-hovered/fa:max-w-sm max-h-7 group-data-hovered/fa:max-h-40"
      >
        <MdEdit className="size-3.5 shrink-0 text-muted-foreground/40 group-data-hovered/fa:text-muted-foreground transition-colors" />
        <FloatingActionFadeIn className="flex flex-wrap items-center gap-1">
          {templates.map((t) => (
            <TemplateChip
              key={t.id}
              template={t}
              insertText={insertText}
              onSend={(tpl) => void sendTemplate(tpl)}
              canSend={canSend}
              sending={sendingId === t.id}
            />
          ))}
        </FloatingActionFadeIn>
      </FloatingAction>
    </div>
  );
}
