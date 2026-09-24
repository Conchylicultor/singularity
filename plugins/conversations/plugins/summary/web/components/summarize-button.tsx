import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { MdAutoAwesome } from "react-icons/md";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { useLatestConversationSummary } from "../hooks";
import { PHASE_CLASSES, PHASE_LABEL } from "./phase-styles";
import { convSummaryPane } from "../panes";

export function SummarizeButton() {
  const { convId } = conversationPane.useParams();
  const latestResult = useLatestConversationSummary(convId);
  const { isOpen, toggle } = convSummaryPane.useToggle({});

  // Render disabled-neutral while pending — badge depends on data so we must
  // not flash the wrong (no-badge) state during the load window.
  if (latestResult.pending) {
    return (
      <Button
        variant={isOpen ? "secondary" : "ghost"}

        disabled
        className="gap-xs text-caption"
        title="Summary"
        aria-label="Summary"
        aria-pressed={isOpen}
      >
        <MdAutoAwesome className="size-3.5" />
        Summary
      </Button>
    );
  }

  const latest = latestResult.data;

  if (!latest) {
    return (
      <Button
        variant={isOpen ? "secondary" : "ghost"}

        onClick={toggle}
        className="gap-xs text-caption"
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
    <Button
      variant={isOpen ? "secondary" : "ghost"}
      onClick={toggle}
      className="gap-xs"
      title={`Summary: ${PHASE_LABEL[latest.phase]}`}
      aria-label={`Summary: ${PHASE_LABEL[latest.phase]}`}
      aria-pressed={isOpen}
    >
      <Badge colorClass={PHASE_CLASSES[latest.phase]}>
        {PHASE_LABEL[latest.phase]}
      </Badge>
    </Button>
  );
}
