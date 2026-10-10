import { usePromptComposer } from "@plugins/conversations/plugins/conversation-view/web";
import { TemplateChip } from "@plugins/conversations/plugins/conversation-view/plugins/prompt-templates/web";
import { ControlSizeProvider } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { goDraft } from "../internal/parse-go";

/**
 * The `<go>` chip: the prompt templates' own split chip, titled Go. ➤ sends
 * the accepted suggestion as a turn; ✎ Go puts it in the draft as a `<go>`
 * region (the editor shows it highlighted, with the GO tab) for the user to
 * reword or add to. Both hand over `<go>…</go>` text — what the agent reads
 * as its own suggestion accepted. Drawn only where there is a prompt to reach
 * (a conversation pane).
 *
 * `select-none` keeps the chip out of a copied selection.
 */
export function GoChip({
  wire,
  draft = wire,
  ready = true,
}: {
  /** What ➤ sends. */
  wire: string;
  /** What ✎ puts in the draft, when it differs (a checklist with nothing picked yet). */
  draft?: string;
  /** Whether there is anything to send yet; ✎ stays live regardless. */
  ready?: boolean;
}) {
  const composer = usePromptComposer();
  if (!composer) return null;
  return (
    <Inline gap="none" className="select-none">
      <ControlSizeProvider size="xs">
        <TemplateChip
          template={{ id: "go", title: "Go", prompt: wire }}
          pinned
          canSend={composer.canSend && ready}
          onInsert={() => composer.insert(goDraft(draft))}
          onSend={() => composer.send(wire)}
        />
      </ControlSizeProvider>
    </Inline>
  );
}
