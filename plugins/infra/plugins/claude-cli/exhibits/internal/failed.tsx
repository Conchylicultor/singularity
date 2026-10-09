import { ClaudeCliCallDetail } from "../../web/components/claude-cli-call-detail";
import { FAILED_CALL } from "./fixtures";

/** A killed `conversation-category` call: the error in place of the output, and an array-valued context key. */
export default function FailedCallExhibit() {
  return <ClaudeCliCallDetail call={FAILED_CALL} />;
}
