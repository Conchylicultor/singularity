import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useMemo, useState } from "react";
import { useLatestRef } from "@plugins/primitives/plugins/latest-ref/web";
import type { IconType } from "react-icons";
import {
  MdDeleteForever,
  MdErrorOutline,
  MdLogout,
  MdPlayArrow,
  MdPlaylistAdd,
  MdReplay,
  MdRocketLaunch,
  MdSend,
  MdStop,
} from "react-icons/md";
import {
  isDraftEmpty,
  conversationPane,
} from "@plugins/conversations/plugins/conversation-view/web";
import {
  useHasActiveSiblingInWorktree,
  useConversation,
  useConversationById,
} from "@plugins/conversations/web";
import { stopConversation } from "@plugins/conversations/core";
import {
  fetchEndpoint,
  getEndpointErrorMessage,
  EndpointError,
} from "@plugins/infra/plugins/endpoints/web";
import {
  sendConversationTurn,
  usePendingTurns,
} from "@plugins/conversations/plugins/conversation-view/plugins/pending-turn/web";
import { useConfig } from "@plugins/config_v2/web";
import { pushAndExitConfig } from "../../shared";
import { pushAndExitDelivery } from "../internal/delivery";
import { resumeConversationEndpoint } from "@plugins/conversations/plugins/conversation-view/plugins/resume/core";
import { exitConversation } from "@plugins/conversations/plugins/conversation-view/plugins/exit/core";
import { dropAndExit } from "@plugins/conversations/plugins/conversation-view/plugins/drop-and-exit/core";
import { toast } from "@plugins/shell/plugins/notifications/web";
import { useDraft } from "@plugins/primitives/plugins/persistent-draft/web";
import {
  useResource,
  useCombinedResources,
} from "@plugins/primitives/plugins/live-state/web";
import { attemptWorkResource } from "@plugins/tasks/plugins/attempt-work/core";
import { useEditedFiles } from "@plugins/conversations/plugins/conversation-view/plugins/code/web";
import type { PromptEditorActionProps } from "@plugins/primitives/plugins/prompt-editor/web";
import { deriveExitMode, type Mode } from "./exit-mode";

// One action per mode: a `run` thunk owning its typed call (so each mode's
// differing param/body/response types stay encapsulated in its own closure — no
// `any`), plus the verb for the error toast and an optional success toast. A
// single runner (`onClick`) drives all of them, so every action shares the same
// in-flight guard, double-click protection, and error handling — no per-mode
// try/toast duplication.
//
// The turn-sending modes (send / queue / go / push-and-exit) return
// SYNCHRONOUSLY: they hand the turn to `sendConversationTurn` and the
// pending-turn card owns the echo, the failure state and Retry from there.
// Awaiting a turn POST here would give the button a private, weaker lifecycle
// than the Enter key's — which is exactly how these three drifted into
// bypassing the optimistic path in the first place.
type ActionSpec = {
  verb: string;
  successToast?: string;
  run: () => void | Promise<void>;
};

// Resume's handler throws HttpError(409, msg) → the server serializes the bare
// message string as the response body. getEndpointErrorMessage only reads
// body.message, so for a plain-string body it would fall back to "HTTP 409"
// and lose the custom message. Prefer a non-empty string body to preserve it.
function endpointErrorText(err: unknown): string {
  if (
    err instanceof EndpointError &&
    typeof err.body === "string" &&
    err.body
  ) {
    return err.body;
  }
  return getEndpointErrorMessage(err);
}

// Colour only. The icon/label gap is Button's own (`gap-1.5` at its default
// size), so these overrides used to restate it — invisibly, because a class
// string reached through an identifier was outside every no-adhoc-* rule.
const PRIMARY = "bg-primary hover:bg-primary/90 text-primary-foreground";

const ICONS: Record<Mode, IconType> = {
  restore: MdReplay,
  send: MdSend,
  queue: MdPlaylistAdd,
  stop: MdStop,
  go: MdPlayArrow,
  "push-and-exit": MdRocketLaunch,
  exit: MdLogout,
  "exit-error": MdErrorOutline,
  "drop-and-exit": MdDeleteForever,
};

const BUTTON_CLASS: Record<Mode, string> = {
  restore: PRIMARY,
  send: PRIMARY,
  queue: PRIMARY,
  go: "bg-success hover:bg-success/90 text-success-foreground",
  stop: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
  "push-and-exit": PRIMARY,
  exit: PRIMARY,
  // Degraded, never destructive: the exit decision is unknown, but closing is
  // always safe.
  "exit-error": PRIMARY,
  "drop-and-exit": PRIMARY,
};

const LABELS: Record<Mode, string> = {
  restore: "Restore",
  send: "Send",
  queue: "Queue",
  stop: "Stop",
  go: "Go",
  "push-and-exit": "Push & Close",
  exit: "Close",
  "exit-error": "Close (state unknown)",
  "drop-and-exit": "Drop & Close",
};

export function PushAndExitButton(_: PromptEditorActionProps) {
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  const live = useConversation(convId) ?? conversation;

  const [draft, setDraft, clearDraft] = useDraft("conversation:prompt", "", {
    scope: convId,
  });
  const [busy, setBusy] = useState(false);
  const draftRef = useLatestRef(draft);
  // Client-side read of the very prompt the server injects for Push & Close —
  // the record echoes it and matches the transcript on it.
  const { prompt: pushPrompt } = useConfig(pushAndExitConfig);
  // Double-click protection for the turn-sending modes. These runs are
  // synchronous, so `busy` (which spans the thunk) no longer covers them — the
  // shared pending-turn state does, and covers rather more: a second click
  // while the first request is still open is blocked no matter which surface
  // started it. `sending` only, so queueing further messages stays open once
  // the request has landed.
  const sendInFlight = usePendingTurns(convId).some(
    (r) => r.state === "sending",
  );

  const filesResult = useEditedFiles(convId);
  // Where this attempt stands relative to `main`, measured from git rather than
  // read off the push ledger — so the destructive Drop-vs-Push default can never
  // be decided by how far a background ingest job happens to have got. The
  // subscription is per attempt because the standing is a fact about this attempt
  // and nothing else.
  const workResult = useResource(attemptWorkResource, {
    attemptId: conversation?.attemptId ?? "",
  });
  // Derived slice: only re-renders when this worktree's sibling-active answer
  // flips, not on every conversations push. `conversation` may be null on first
  // render — the value is only consumed below after the `!conversation` guard.
  const siblingResult = useHasActiveSiblingInWorktree(
    conversation?.worktreePath ?? "",
    convId,
  );
  // The exit-vs-drop decision reads THREE independently-arriving resources
  // (the attempt standing + the conversations sibling slice + edited-files). Gate
  // on all together: while any is loading the button shows a neutral disabled
  // "Exit" instead of falling through to the destructive "Drop & Exit" default —
  // or flashing it before edited-files settle into "Push & Exit".
  const exitDecision = useCombinedResources({
    work: workResult,
    hasSibling: siblingResult,
    files: filesResult,
  });

  const { mode, provisional } = useMemo(
    () =>
      deriveExitMode({
        conversation,
        live,
        draftEmpty: isDraftEmpty(draft),
        exitDecision,
      }),
    [draft, exitDecision, conversation, live],
  );

  if (!conversation || !live) return null;

  const hasSession = !!live.claudeSessionId;
  // `provisional` (data still loading) keeps the neutral mode un-clickable.
  // Double-click protection comes from whichever half owns the in-flight state:
  // `busy` + the button's `loading` prop for the awaited actions, `sendInFlight`
  // for the turn-sending ones whose thunk returns immediately.
  const sendsATurn =
    mode === "send" ||
    mode === "queue" ||
    mode === "go" ||
    mode === "push-and-exit";
  const disabled =
    mode === "restore"
      ? !hasSession
      : live.status === "starting" ||
        provisional ||
        (sendsATurn && sendInFlight);

  function specFor(m: Mode): ActionSpec | null {
    switch (m) {
      case "restore":
        return {
          verb: "Resume",
          successToast: "Resuming conversation…",
          run: () => fetchEndpoint(resumeConversationEndpoint, { id: convId }),
        };
      case "send":
      case "queue": {
        const current = draftRef.current;
        if (isDraftEmpty(current)) return null;
        return {
          // Same turn send for both; the server skips the C-c interrupt when the
          // agent is working so the turn is queued rather than sent immediately.
          verb: m === "queue" ? "Queue" : "Send",
          run: () => {
            // Clear first, exactly as Enter does: the draft is spent the moment
            // the record exists, and the record holds the text for Retry.
            clearDraft();
            sendConversationTurn(convId, { text: current });
          },
        };
      }
      case "go":
        return {
          verb: "Go",
          run: () => {
            sendConversationTurn(convId, { text: "Go" });
          },
        };
      case "stop":
        return {
          verb: "Stop",
          run: async () => {
            const data = await fetchEndpoint(stopConversation, { id: convId });
            if (data?.rewindText) setDraft(data.rewindText);
          },
        };
      case "push-and-exit":
        return {
          verb: "Push & Close",
          run: () => {
            // The wrap-up prompt is a turn like any other: echo it, confirm it
            // against the transcript, report it if it never lands. The text is
            // read from the same config the server sends verbatim, so the two
            // sides match by construction.
            sendConversationTurn(convId, {
              text: pushPrompt,
              delivery: pushAndExitDelivery,
              payload: null,
            });
          },
        };
      // Same action either way: closing a conversation touches no task state,
      // so it is safe to offer even when the exit decision is undecidable.
      case "exit":
      case "exit-error":
        return {
          verb: "Close",
          successToast: "Conversation closed",
          run: () => fetchEndpoint(exitConversation, { id: convId }),
        };
      case "drop-and-exit":
        return {
          verb: "Drop & Close",
          successToast: "Task dropped and conversation closed",
          run: async () => {
            await fetchEndpoint(dropAndExit, { id: convId });
          },
        };
    }
  }

  async function onClick() {
    if (busy || disabled) return;
    const spec = specFor(mode);
    if (!spec) return;
    setBusy(true);
    try {
      await spec.run();
      if (spec.successToast) {
        toast({
          type: "conversation",
          title: spec.verb,
          description: spec.successToast,
          variant: "success",
        });
      }
    } catch (err) {
      toast({
        type: "conversation",
        title: `${spec.verb} failed`,
        description: endpointErrorText(err),
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  const label = LABELS[mode];
  const Icon = ICONS[mode];

  return (
    <Button
      variant="default"
      title={label}
      aria-label={label}
      loading={busy}
      disabled={disabled}
      onClick={onClick}
      className={BUTTON_CLASS[mode]}
    >
      <Icon className="size-3.5" />
      {label}
    </Button>
  );
}
