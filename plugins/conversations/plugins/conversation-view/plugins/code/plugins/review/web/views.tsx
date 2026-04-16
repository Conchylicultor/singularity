import type { MainViewDescriptor } from "@plugins/conversations/plugins/conversation-view/web/commands";
import { ReviewView } from "./components/review-view";

export const REVIEW_MAIN_VIEW_ID = "code.review";

export function reviewMainView(): MainViewDescriptor {
  return { id: REVIEW_MAIN_VIEW_ID, component: ReviewView };
}
