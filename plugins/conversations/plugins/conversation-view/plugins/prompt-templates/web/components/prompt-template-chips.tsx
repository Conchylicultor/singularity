import {
  Button,
  ButtonGroup,
  cn,
  ControlSizeProvider,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useMemo } from "react";
import { MdEdit, MdSend } from "react-icons/md";
import {
  FloatingAction,
  FloatingActionFadeIn,
} from "@plugins/primitives/plugins/overlay/plugins/floating-action/web";
import { AdaptiveBar } from "@plugins/primitives/plugins/adaptive-bar/web";
import {
  Stack,
  selfClass,
} from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { Scroll } from "@plugins/primitives/plugins/css/plugins/scroll/web";
import { ConfigGearButton } from "@plugins/config_v2/plugins/config-link/web";
import type { PromptEditorActionProps } from "@plugins/primitives/plugins/prompt-editor/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import {
  useConversation,
  useConversationById,
} from "@plugins/conversations/web";
import { sendConversationTurn } from "@plugins/conversations/plugins/conversation-view/plugins/pending-turn/web";
import { useConfig } from "@plugins/config_v2/web";
import {
  recordUsage,
  useUsageOrder,
} from "@plugins/primitives/plugins/usage-rank/web";
import { promptTemplatesConfig } from "../../shared/config";

/** Usage-rank namespace for the prompt-template chips. */
const USAGE_NAMESPACE = "prompt-templates";

interface TemplateItem {
  id: string;
  title: string;
  prompt: string;
}

// Both use sites record: the ✎ insert-into-draft here and the ➤ send-turn in
// `sendTemplate`. Recording inside the two handlers — rather than at each of
// the two surfaces that render `TemplateChip` — is what keeps the pinned strip
// and the floating panel from drifting apart.
function applyTemplate(t: TemplateItem, insertText: (text: string) => void) {
  recordUsage(USAGE_NAMESPACE, t.id);
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
    // No text class here: `Button` writes its own rung from the ambient density
    // (`buttonTextClassFor`), so a font-size on this wrapper never reaches the
    // labels — it only looked like it was doing something.
    <ButtonGroup className={cn(!pinned && "[&>*]:border-dashed")}>
      <Button
        variant="outline"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => applyTemplate(template, insertText)}
      >
        <MdEdit className="size-3" />
        <span>{template.title}</span>
      </Button>
      {/* eslint-disable-next-line icon-button/prefer-icon-button -- the send half of a ButtonGroup template chip, not a standalone action: it shares the chip's outline seam and its size-3 glyph matches the label half */}
      <Button
        variant="outline"
        disabled={!canSend}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onSend(template)}
        className={
          canSend ? "text-muted-foreground" : "text-muted-foreground/30"
        }
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

  // Most-used first, frozen for as long as this conversation is open (the
  // primitive owns the freeze). The authored config order stays the tie-break
  // for anything never used, so an untouched install looks exactly as before.
  const ids = useMemo(() => templates.map((t) => t.id), [templates]);
  const order = useUsageOrder(USAGE_NAMESPACE, ids, convId);

  // ONE derived array feeds both surfaces — the pinned strip is its head and
  // the panel is the whole of it, so the two can never disagree on the order.
  const ordered = useMemo(() => {
    const byId = new Map(templates.map((t) => [t.id, t]));
    return order.map((id) => {
      const t = byId.get(id);
      // `useUsageOrder` returns a permutation of the ids it was given; a miss
      // means that contract broke, and silently dropping the chip would hide it.
      if (!t) throw new Error(`No prompt template for usage-ranked id: ${id}`);
      return t;
    });
  }, [order, templates]);

  const pinnedTemplates = useMemo(
    () => ordered.slice(0, pinnedCount),
    [ordered, pinnedCount],
  );

  // No in-flight state, no error toast: sendConversationTurn owns the echo
  // card, the retry affordance and the delivery report. Clearing the editor
  // synchronously mirrors the prompt input's own send.
  function sendTemplate(t: TemplateItem) {
    if (!canSend) return;
    recordUsage(USAGE_NAMESPACE, t.id);
    const existing = getContent().trim();
    const text = existing ? `${t.prompt}\n\n${existing}` : t.prompt;
    clearContent();
    sendConversationTurn(convId, { text });
  }

  if (templates.length === 0) return null;

  // The chips are a sub-region of the prompt bar, not lone controls, so THIS is
  // where their density is declared — one step below the bar's own, matching how
  // a table or a card sets the size for everything it holds. Individual chips
  // still never name a height; they read this. The pinned strip and the panel
  // sit inside the same provider so the two surfaces can't drift apart.
  return (
    <ControlSizeProvider size="xs">
      <Stack direction="row" gap="xs" align="center">
        {pinnedTemplates.length > 0 && (
          // `clip`, not a second `⋯`: a chip that doesn't fit is simply dropped
          // from the strip, because every template is already one hover away in
          // the panel beside it.
          //
          // `end`, because the bar holds this row's slack and therefore decides
          // where the row's empty space sits. Packed to the start, the slack
          // lands BETWEEN the last chip and the ✎ beside it — splitting one
          // control into two. Packed to the end, the strip and its trigger stay
          // one group and the empty space falls at the left of the row, which is
          // what a leading spacer used to be authored into the layout to do.
          <AdaptiveBar gap="xs" overflow="clip" align="end">
            {pinnedTemplates.map((t) => (
              <AdaptiveBar.Item key={t.id} id={t.id}>
                <TemplateChip
                  template={t}
                  insertText={insertText}
                  pinned
                  onSend={sendTemplate}
                  canSend={canSend}
                />
              </AdaptiveBar.Item>
            ))}
          </AdaptiveBar>
        )}
        {/* `FloatingAction` is not density-participating, so its collapsed box
            can't read the provider above — these numbers are hand-matched to the
            xs chip height (1.5rem) it sits beside. */}
        <FloatingAction
          className="relative size-6 z-popover"
          variant="ghost"
          // A column with the gear at the BOTTOM of the opened stack, chips
          // flush with the prompt bar's right edge.
          direction="col"
          triggerAt="end"
          align="end"
          gap="xs"
          pad="xs"
          // The same panel's collapsed→open morph, which the primitive animates
          // but does not size.
          panelClassName={cn(
            "max-w-6 group-data-open/fa:max-w-sm max-h-6 group-data-open/fa:max-h-56",
          )}
          trigger={
            <MdEdit className="size-3 text-muted-foreground/40 group-data-open/fa:text-muted-foreground transition-colors" />
          }
        >
          <FloatingActionFadeIn>
            <Stack gap="xs" align="start">
              {/* The wrapper stays: ConfigGearButton takes only descriptor/label,
                  so this div is the flex item selfClass has to land on. */}
              <div className={selfClass("end")}>
                <ConfigGearButton
                  descriptor={promptTemplatesConfig}
                  label="Configure: Prompt templates"
                />
              </div>
              <Scroll className="max-h-40">
                <Cluster gap="xs" align="center">
                  {ordered.map((t) => (
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
    </ControlSizeProvider>
  );
}
