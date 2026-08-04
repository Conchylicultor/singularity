import { Button, ButtonGroup, cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useMemo } from "react";
import { MdEdit, MdSend } from "react-icons/md";
import {
  FloatingAction,
  FloatingActionFadeIn,
} from "@plugins/primitives/plugins/floating-action/web";
import { ResponsiveOverflow } from "@plugins/primitives/plugins/responsive-overflow/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { ConfigGearButton } from "@plugins/config_v2/plugins/config-link/web";
import type { PromptEditorActionProps } from "@plugins/primitives/plugins/prompt-editor/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversation, useConversationById } from "@plugins/conversations/web";
import { sendConversationTurn } from "@plugins/conversations/plugins/conversation-view/plugins/pending-turn/web";
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
}: {
  template: TemplateItem;
  insertText: (text: string) => void;
  pinned?: boolean;
  onSend: (t: TemplateItem) => void;
  canSend: boolean;
}) {
  return (
    <ButtonGroup className={cn("text-caption", !pinned && "[&>*]:border-dashed")}>
      <Button
        variant="outline"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => applyTemplate(template, insertText)}
      >
        <MdEdit className="size-3" />
        <span>{template.title}</span>
      </Button>
      <Button
        variant="outline"
        disabled={!canSend}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onSend(template)}
        className={canSend ? "text-muted-foreground" : "text-muted-foreground/30"}
      >
        <MdSend className="size-3" />
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

  // The same gate the prompt input applies to Enter — a template send IS a turn
  // send, so the two must open and close together. In particular `working` stays
  // sendable: the server queues the turn exactly as it does for a typed one.
  const canSend =
    !!live &&
    live.status !== "gone" &&
    live.status !== "done" &&
    live.status !== "starting" &&
    !live.waitingFor;

  const pinnedTemplates = useMemo(
    () => templates.slice(0, pinnedCount),
    [templates, pinnedCount],
  );

  // No in-flight state, no error toast: sendConversationTurn owns the echo
  // card, the retry affordance and the delivery report. Clearing the editor
  // synchronously mirrors the prompt input's own send.
  function sendTemplate(t: TemplateItem) {
    if (!canSend) return;
    const existing = getContent().trim();
    const text = existing ? `${t.prompt}\n\n${existing}` : t.prompt;
    clearContent();
    sendConversationTurn(convId, { text });
  }

  if (templates.length === 0) return null;

  return (
    <Stack direction="row" gap="xs" align="center">
      {pinnedTemplates.length > 0 && (
        // eslint-disable-next-line layout/no-adhoc-layout -- items-center cross-aligns chips on ResponsiveOverflow's internal flex container; the primitive exposes no align prop
        <ResponsiveOverflow gap={4} className="items-center">
          {pinnedTemplates.map((t) => (
            <TemplateChip
              key={t.id}
              template={t}
              insertText={insertText}
              pinned
              onSend={sendTemplate}
              canSend={canSend}
            />
          ))}
        </ResponsiveOverflow>
      )}
      <FloatingAction
        className="relative size-7 z-popover"
        variant="ghost"
        panelClassName="flex-col-reverse items-end gap-xs p-xs group-data-open/fa:px-xs max-w-7 group-data-open/fa:max-w-sm max-h-7 group-data-open/fa:max-h-56"
        trigger={
          <MdEdit className="size-3.5 text-muted-foreground/40 group-data-open/fa:text-muted-foreground transition-colors" />
        }
      >
        <FloatingActionFadeIn>
          <Stack gap="xs" align="start">
            {/* eslint-disable-next-line layout/no-adhoc-layout -- per-child self-alignment (right-align the gear within the start-aligned column); no container primitive owns one child's cross-axis override */}
            <div className="self-end">
              <ConfigGearButton
                descriptor={promptTemplatesConfig}
                label="Configure: Prompt templates"
              />
            </div>
            <Scroll className="max-h-40">
              <Cluster gap="xs" align="center">
                {templates.map((t) => (
                  <TemplateChip
                    key={t.id}
                    template={t}
                    insertText={insertText}
                    onSend={sendTemplate}
                    canSend={canSend}
                  />
                ))}
              </Cluster>
            </Scroll>
          </Stack>
        </FloatingActionFadeIn>
      </FloatingAction>
    </Stack>
  );
}
