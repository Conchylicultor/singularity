import { MdAutoAwesome } from "react-icons/md";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@plugins/primitives/plugins/badge/web";
import {
  conversationSummariesResource,
  type ConversationSummary,
} from "../../shared/resources";
import { PHASE_CLASSES, PHASE_LABEL } from "./phase-styles";
import { convSummaryPane } from "../panes";

export function SummarizeButton() {
  const { convId } = conversationPane.useParams();
  const summariesResult = useResource(conversationSummariesResource);
  const summaries: ConversationSummary[] | undefined =
    summariesResult.pending ? undefined : summariesResult.data[convId];
  const latest = summaries?.[0];

  const { isOpen, toggle } = convSummaryPane.useToggle({ convId }, { input: { convId } });

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
      <Badge colorClass={PHASE_CLASSES[latest.phase]}>
        {PHASE_LABEL[latest.phase]}
      </Badge>
    </button>
  );
}
