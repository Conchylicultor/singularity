import { ClaudeCliCallDetail } from "../../web/components/claude-cli-call-detail";
import { SUCCEEDED_CALL } from "./fixtures";

/** A `task-title` call that answered: output, prompt and system, one task id of context. */
export default function SucceededCallExhibit() {
  return <ClaudeCliCallDetail call={SUCCEEDED_CALL} />;
}
