import { MdCallSplit, MdEdit, MdUndo } from "react-icons/md";
import {
  Button,
  ControlSizeProvider,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useGoBackToMessage } from "@plugins/conversations/plugins/conversation-view/plugins/rewind/web";
import { restoreAnswerDraft } from "./answer-draft";
import { type Question } from "./answer-model";

/**
 * On an answered question: go back to just before the answer was sent, and
 * reopen the question's form with the previous answer filled in — either here
 * (the agent forgets everything since) or in a new conversation.
 *
 * The answer is an ordinary user turn this plugin hides from the transcript, so
 * the transcript's own per-message rewind never shows for it; the card is the
 * only place that can offer it.
 */
export function ChangeAnswersButton({
  convId,
  toolUseId,
  answerUuid,
  questions,
}: {
  convId: string;
  toolUseId: string;
  answerUuid: string | undefined;
  questions: Question[];
}) {
  const { available, busy, run } = useGoBackToMessage({
    convId,
    uuid: answerUuid,
    // The removed text is the serialized answer: put it back in the form, not
    // in the prompt editor.
    onBack: (targetConvId, answerText) =>
      restoreAnswerDraft(targetConvId, toolUseId, questions, answerText),
  });

  if (!available) return null;

  return (
    <DropdownMenu>
      <ControlSizeProvider size="sm">
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" loading={busy}>
              <MdEdit />
              Change answers
            </Button>
          }
        />
      </ControlSizeProvider>
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={busy} onClick={() => void run("rewind")}>
          <MdUndo />
          Rewind and answer again
        </DropdownMenuItem>
        <DropdownMenuItem disabled={busy} onClick={() => void run("fork")}>
          <MdCallSplit />
          Answer again in a fork
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
