import { Button, ButtonGroup, cn } from "@plugins/primitives/plugins/ui-kit/web";
import { useState, useMemo } from "react";
import { MdEdit, MdSend } from "react-icons/md";
import {
  FloatingAction,
  FloatingActionFadeIn,
} from "@plugins/primitives/plugins/floating-action/web";
import { ResponsiveOverflow } from "@plugins/primitives/plugins/responsive-overflow/web";
import { Stack } from "@plugins/primitives/plugins/spacing/web";
import { ConfigGearButton } from "@plugins/config_v2/plugins/config-link/web";
import type { PromptEditorActionProps } from "@plugins/primitives/plugins/prompt-editor/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversation, useConversationById } from "@plugins/conversations/web";
import { postConversationTurn } from "@plugins/conversations/core";
import { fetchEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { toast } from "@plugins/shell/plugins/notifications/web";
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
    <ButtonGroup className={cn("text-caption", !pinned && "[&>*]:border-dashed")}>
      <Button
        variant="outline"
        size="xs"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => applyTemplate(template, insertText)}
      >
        <MdEdit className="size-3 shrink-0" />
        <span>{template.title}</span>
      </Button>
      <Button
        variant="outline"
        size="xs"
        disabled={!canSend || sending}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onSend(template)}
        className={canSend && !sending ? "text-muted-foreground" : "text-muted-foreground/30"}
      >
        <MdSend className="size-3 shrink-0" />
      </Button>
    </ButtonGroup>
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
        title: "Failed to send",
        description: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
    } finally {
      setSendingId(null);
    }
  }

  if (templates.length === 0) return null;

  return (
    <Stack direction="row" gap="xs" align="center">
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
        className="relative size-7 z-popover"
        variant="ghost"
        panelClassName="flex-col-reverse items-end gap-xs p-xs group-data-open/fa:px-xs max-w-7 group-data-open/fa:max-w-sm max-h-7 group-data-open/fa:max-h-56"
      >
        <MdEdit className="size-3.5 shrink-0 text-muted-foreground/40 group-data-open/fa:text-muted-foreground transition-colors" />
        <FloatingActionFadeIn className="flex flex-col items-start gap-xs">
          <div className="self-end">
            <ConfigGearButton
              descriptor={promptTemplatesConfig}
              label="Configure: Prompt templates"
            />
          </div>
          <div className="flex max-h-40 flex-wrap items-center gap-xs overflow-y-auto">
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
          </div>
        </FloatingActionFadeIn>
      </FloatingAction>
    </Stack>
  );
}
