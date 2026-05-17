import { MdRateReview } from "react-icons/md";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { Button } from "@/components/ui/button";
import { convReviewPane } from "../panes";

export function ReviewButton() {
  const { conversation } = conversationPane.useData();
  const { isOpen, toggle } = convReviewPane.useToggle({ convId: conversation.id });

  return (
    <Button
      variant={isOpen ? "secondary" : "ghost"}
      size="sm"
      title="Review"
      aria-label="Review"
      aria-pressed={isOpen}
      onClick={toggle}
      className="gap-1.5"
    >
      <MdRateReview className="size-4" />
    </Button>
  );
}
