import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useMemo, useRef, useState } from "react";
import type { IconType } from "react-icons";
import { MdDeleteForever, MdLogout, MdPlayArrow, MdPlaylistAdd, MdReplay, MdRocketLaunch, MdSend, MdStop } from "react-icons/md";
import { isDraftEmpty, conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useHasActiveSiblingInWorktree, useConversation, useConversationById } from "@plugins/conversations/web";
import { postConversationTurn, stopConversation } from "@plugins/conversations/core";
import { fetchEndpoint, getEndpointErrorMessage, EndpointError } from "@plugins/infra/plugins/endpoints/web";
import { startPushAndExit } from "../../shared";
import { resumeConversationEndpoint } from "@plugins/conversations/plugins/conversation-view/plugins/resume/core";
import { exitConversation } from "@plugins/conversations/plugins/conversation-view/plugins/exit/core";
import { dropAndExit } from "@plugins/conversations/plugins/conversation-view/plugins/drop-and-exit/core";
import { toast } from "@plugins/shell/plugins/notifications/web";
import { useDraft } from "@plugins/primitives/plugins/persistent-draft/web";
import { useResource, useCombinedResources } from "@plugins/primitives/plugins/live-state/web";
import { pushesResource } from "@plugins/tasks/plugins/tasks-core/core";
import { useEditedFiles } from "@plugins/conversations/plugins/conversation-view/plugins/code/web";
import type { PromptEditorActionProps } from "@plugins/primitives/plugins/prompt-editor/web";

type Mode = "send" | "queue" | "push-and-exit" | "exit" | "drop-and-exit" | "go" | "restore" | "stop";

// One action per mode: a `run` thunk owning its typed fetchEndpoint call (so
// each mode's differing param/body/response types stay encapsulated in its own
// closure — no `any`), plus the verb for the error toast and an optional
// success toast. A single runner (`onClick`) drives all of them, so every
// action shares the same in-flight guard, double-click protection, and error
// handling — no per-mode try/toast duplication.
type ActionSpec = {
  verb: string;
  successToast?: string;
  run: () => Promise<void>;
};

// Resume's handler throws HttpError(409, msg) → the server serializes the bare
// message string as the response body. getEndpointErrorMessage only reads
// body.message, so for a plain-string body it would fall back to "HTTP 409"
// and lose the custom message. Prefer a non-empty string body to preserve it.
function endpointErrorText(err: unknown): string {
  if (err instanceof EndpointError && typeof err.body === "string" && err.body) {
    return err.body;
  }
  return getEndpointErrorMessage(err);
}

const PRIMARY = "gap-1.5 bg-primary hover:bg-primary/90 text-primary-foreground";

const ICONS: Record<Mode, IconType> = {
  restore: MdReplay,
  send: MdSend,
  queue: MdPlaylistAdd,
  stop: MdStop,
  go: MdPlayArrow,
  "push-and-exit": MdRocketLaunch,
  exit: MdLogout,
  "drop-and-exit": MdDeleteForever,
};

const BUTTON_CLASS: Record<Mode, string> = {
  restore: PRIMARY,
  send: PRIMARY,
  queue: PRIMARY,
  go: "gap-1.5 bg-success hover:bg-success/90 text-success-foreground",
  stop: "gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90",
  "push-and-exit": PRIMARY,
  exit: PRIMARY,
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
  "drop-and-exit": "Drop & Close",
};

export function PushAndExitButton(_: PromptEditorActionProps) {
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  const live = useConversation(convId) ?? conversation;

  const [draft, setDraft, clearDraft] = useDraft("conversation:prompt", "", { scope: convId });
  const [busy, setBusy] = useState(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const filesResult = useEditedFiles(convId);
  const pushesResult = useResource(pushesResource);
  // Derived slice: only re-renders when this worktree's sibling-active answer
  // flips, not on every conversations push. `conversation` may be null on first
  // render — the value is only consumed below after the `!conversation` guard.
  const siblingResult = useHasActiveSiblingInWorktree(
    conversation?.worktreePath ?? "",
    convId,
  );
  // The exit-vs-drop decision reads THREE independently-arriving resources
  // (pushes + the conversations sibling slice + edited-files). Gate on all
  // together: while any is loading the button shows a neutral disabled "Exit"
  // instead of falling through to the destructive "Drop & Exit" default — or
  // flashing it before edited-files settle into "Push & Exit".
  const exitDecision = useCombinedResources({
    pushes: pushesResult,
    hasSibling: siblingResult,
    files: filesResult,
  });

  const isNotRunning = live?.status === "gone" || live?.status === "done";

  const { mode, provisional } = useMemo((): { mode: Mode; provisional: boolean } => {
    if (!conversation || !live) return { mode: "exit", provisional: false };
    if (isNotRunning) return { mode: "restore", provisional: false };
    // A draft while the agent is working is queued (pasted without a C-c
    // interrupt) rather than sent immediately — surface that as "Queue".
    if (!isDraftEmpty(draft))
      return { mode: live.status === "working" ? "queue" : "send", provisional: false };
    if (live.status === "working") return { mode: "stop", provisional: false };
    if (exitDecision.pending) return { mode: "exit", provisional: true };
    const { pushes, hasSibling, files } = exitDecision.data;
    if (files.length > 0) {
      if (files.every((f) => f.path.startsWith("research/"))) return { mode: "go", provisional: false };
      return { mode: "push-and-exit", provisional: false };
    }
    const hasPush = pushes.some((p) => p.attemptId === conversation.attemptId);
    if (hasPush) return { mode: "exit", provisional: false };
    return { mode: hasSibling ? "exit" : "drop-and-exit", provisional: false };
  }, [isNotRunning, draft, exitDecision, conversation, live]);

  if (!conversation || !live) return null;

  const hasSession = !!live.claudeSessionId;
  // `provisional` (data still loading) keeps the neutral mode un-clickable.
  // `busy` (any in-flight POST) is handled via the button's `loading` prop,
  // which both disables the clicked button and shows its spinner — uniform
  // double-click protection across every action.
  const disabled = mode === "restore"
    ? !hasSession
    : live.status === "starting" || provisional;

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
          // Same turn POST for both; the server skips the C-c interrupt when the
          // agent is working so the turn is queued rather than sent immediately.
          verb: m === "queue" ? "Queue" : "Send",
          run: async () => {
            await fetchEndpoint(postConversationTurn, { id: convId }, { body: { text: current } });
            clearDraft();
          },
        };
      }
      case "go":
        return {
          verb: "Go",
          run: () => fetchEndpoint(postConversationTurn, { id: convId }, { body: { text: "Go" } }),
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
          run: () => fetchEndpoint(startPushAndExit, { id: convId }),
        };
      case "exit":
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
        toast({ type: "conversation", title: spec.verb, description: spec.successToast, variant: "success" });
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
