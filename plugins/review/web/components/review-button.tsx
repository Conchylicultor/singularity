import { Button } from "@plugins/primitives/plugins/ui-kit/web";
import { MdRateReview } from "react-icons/md";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { convReviewPane } from "../panes";
import { Review } from "../slots";

export function ReviewButton() {
  const { convId } = conversationPane.useParams();
  const { isOpen, toggle } = convReviewPane.useToggle({ convId }, { input: { convId } });
  const sections = Review.Section.useContributions();

  return (
    <Button
      variant={isOpen ? "secondary" : "ghost"}
      size="sm"
      title="Review"
      aria-label="Review"
      aria-pressed={isOpen}
      onClick={toggle}
      className="gap-xs"
    >
      <MdRateReview className="size-4" />
      {sections.map((s) => {
        const S = s.summary;
        return S ? <S key={s.id} conversationId={convId} source={{ kind: "working" }} /> : null;
      })}
    </Button>
  );
}
