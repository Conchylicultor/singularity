import { MdAutoAwesome } from "react-icons/md";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  conversationSummariesResource,
  type ConversationSummary,
} from "../../shared/resources";
import { PHASE_CLASSES, PHASE_LABEL } from "./phase-styles";
import { convSummaryPane } from "../panes";

export function SummarizeButton() {
  const { conversation } = conversationPane.useData();
  const { data: byConversation } = useResource(conversationSummariesResource);
  const summaries: ConversationSummary[] | undefined =
    byConversation[conversation.id];
  const latest = summaries?.[0];

  const { isOpen, toggle } = convSummaryPane.useToggle({ convId: conversation.id });

  if (!latest) {
    return (
      <Button
        variant={isOpen ? "secondary" : "ghost"}
        size="sm"
        onClick={toggle}
        className="gap-1.5 text-xs"
        title="Summary"
        aria-label="Summary"
        aria-pressed={isOpen}
      >
        <MdAutoAwesome className="size-3.5" />
        Summary
      </Button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`${buttonVariants({ variant: isOpen ? "secondary" : "ghost", size: "sm" })} gap-1.5`}
      title={`Summary: ${PHASE_LABEL[latest.phase]}`}
      aria-label={`Summary: ${PHASE_LABEL[latest.phase]}`}
      aria-pressed={isOpen}
    >
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${PHASE_CLASSES[latest.phase]}`}
      >
        {PHASE_LABEL[latest.phase]}
      </span>
    </button>
  );
}
