import { useState } from "react";
import { MdCallSplit, MdHistory, MdUndo } from "react-icons/md";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import type { JsonlEvent } from "@plugins/conversations/plugins/transcript-watcher/core";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { normalizeModel } from "@plugins/conversations/plugins/model-provider/core";
import { RowActionButton } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/row-actions/web";
import { setConversationPromptDraft } from "@plugins/conversations/plugins/conversation-view/plugins/prompt-input/web";
import { useLaunchConversation } from "@plugins/primitives/plugins/launch/web";
import { confirmDialog } from "@plugins/primitives/plugins/overlay/plugins/imperative-dialog/plugins/confirm/web";
import {
  fetchEndpoint,
  getEndpointErrorMessage,
} from "@plugins/infra/plugins/endpoints/web";
import { toast } from "@plugins/shell/plugins/notifications/web";
import { previewRewindEndpoint, rewindConversationEndpoint } from "../../core";
import { LossList } from "./loss-list";
import { describeLosses, type RewindMode } from "../internal/describe-losses";

/**
 * On each of the user's own messages: go back to just before it, either in this
 * conversation ("Rewind to here") or in a new one ("Fork from here"). The
 * message's text lands in the prompt editor either way, ready to be rewritten.
 */
export function RewindAction({ event }: { event: JsonlEvent }) {
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  const [busy, setBusy] = useState(false);
  // The text to put in the FORK's editor: known once the preview answers, used
  // once the new conversation exists.
  const [forkDraft, setForkDraft] = useState("");
  const uuid = event.kind === "user-text" ? event.uuid : undefined;

  const { launch } = useLaunchConversation({
    getRequest: () => ({
      forkFromConversationId: convId,
      forkAtMessageUuid: uuid,
    }),
    onLaunched: (created) => setConversationPromptDraft(created.id, forkDraft),
  });

  // No uuid: the row is text that merely arrived in a user-role line, not a
  // message the user typed. No session: nothing to resume from.
  if (!uuid || !conversation?.claudeSessionId) return null;
  const model = normalizeModel(conversation.model);

  const rewind = async () => {
    const outcome = await fetchEndpoint(
      rewindConversationEndpoint,
      { id: convId },
      { body: { uuid } },
    );
    if (!outcome.ok) throw new Error(outcome.message);
    setConversationPromptDraft(convId, outcome.rewindText);
  };

  const run = async (mode: RewindMode) => {
    if (busy) return;
    setBusy(true);
    try {
      const preview = await fetchEndpoint(
        previewRewindEndpoint,
        { id: convId },
        { body: { uuid } },
      );
      if (!preview.ok) return refused(preview.message);
      if (mode === "rewind" && !preview.inPlace) {
        return refused(
          "This message predates a fork, so the conversation cannot be rewound to it in place. Fork from it instead.",
        );
      }
      setForkDraft(preview.messageText);
      const act = mode === "rewind" ? rewind : () => launch(model);
      const lines = describeLosses(preview, mode);
      if (lines.length === 0) return await act();
      void confirmDialog({
        title:
          mode === "rewind"
            ? "Rewind to this message?"
            : "Fork from this message?",
        description: preview.messageText.slice(0, 140),
        confirmLabel: mode === "rewind" ? "Rewind" : "Fork",
        children: <LossList lines={lines} />,
        onConfirm: act,
      });
    } catch (err) {
      refused(getEndpointErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <RowActionButton title="Go back to this message">
            <MdHistory className="size-3" />
          </RowActionButton>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem disabled={busy} onClick={() => void run("rewind")}>
          <MdUndo />
          Rewind to here
        </DropdownMenuItem>
        <DropdownMenuItem disabled={busy} onClick={() => void run("fork")}>
          <MdCallSplit />
          Fork from here
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function refused(message: string): void {
  toast({
    type: "conversation",
    title: "Cannot go back to this message",
    description: message,
    variant: "error",
  });
}
