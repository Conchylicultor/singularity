import { useState, useMemo } from "react";
import { PenLine, SendHorizontal } from "lucide-react";
import {
  FloatingAction,
  FloatingActionFadeIn,
} from "@plugins/primitives/plugins/floating-action/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import type { PromptEditorActionProps } from "@plugins/primitives/plugins/prompt-editor/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { postConversationTurn } from "@plugins/conversations/core";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { ShellCommands as Shell } from "@plugins/shell/web";
import { useConfigValues } from "@plugins/config/web";
import { usePromptTemplate } from "../../shared/endpoints";
import { promptTemplatesResource } from "../../shared/resources";
import type { PromptTemplate } from "../../shared/resources";
import { promptTemplatesConfig } from "../../shared/config";

function applyTemplate(
  t: PromptTemplate,
  insertText: (text: string) => void,
) {
  insertText(t.prompt);
  void fetch(`/api/prompt-templates/${t.id}/use`, { method: "POST" });
}

function TemplateChip({
  template,
  insertText,
  pinned,
  onSend,
  canSend,
  sending,
}: {
  template: PromptTemplate;
  insertText: (text: string) => void;
  pinned?: boolean;
  onSend: (t: PromptTemplate) => void;
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
        <PenLine className="size-3 shrink-0" />
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
        <SendHorizontal className="size-3 shrink-0" />
      </button>
    </div>
  );
}

export function FloatingTemplateChips({ insertText }: PromptEditorActionProps) {
  const conversationData = conversationPane.useDataMaybe();
  const live = useConversationById(conversationData?.conversation.id ?? null) ?? conversationData?.conversation;
  const templatesResult = useResource(promptTemplatesResource);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const { pinnedCount } = useConfigValues(promptTemplatesConfig, "conversation-prompt-templates");

  const conversation = conversationData?.conversation;
  const canSend = live?.status === "waiting" && sendingId === null;

  const pinnedTemplates = useMemo(
    () => templatesResult.pending ? [] : templatesResult.data.slice(0, pinnedCount),
    [templatesResult, pinnedCount],
  );

  async function sendTemplate(t: PromptTemplate) {
    if (!canSend || !conversation) return;
    setSendingId(t.id);
    try {
      void fetchEndpoint(usePromptTemplate, { id: t.id });
      await fetchEndpoint(postConversationTurn, { id: conversation.id }, { body: { text: t.prompt } });
    } catch (err) {
      Shell.Toast({
        description: `Failed to send: ${err instanceof Error ? err.message : String(err)}`,
        variant: "error",
      });
    } finally {
      setSendingId(null);
    }
  }

  if (templatesResult.pending) return null;
  const templates = templatesResult.data;
  if (templates.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5">
      {pinnedTemplates.length > 0 && (
        <div className="flex items-center gap-1">
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
        </div>
      )}
      <FloatingAction
        variant="ghost"
        panelClassName="flex-col-reverse items-end gap-1 p-1 group-data-hovered/fa:px-1.5 max-w-7 group-data-hovered/fa:max-w-sm max-h-7 group-data-hovered/fa:max-h-40"
      >
        <PenLine className="size-3.5 shrink-0 text-muted-foreground/40 group-data-hovered/fa:text-muted-foreground transition-colors" />
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
