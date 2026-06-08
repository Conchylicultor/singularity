import { useMemo, useRef, useState } from "react";
import type { IconType } from "react-icons";
import { MdDeleteForever, MdLogout, MdPlayArrow, MdReplay, MdRocketLaunch, MdSend, MdStop } from "react-icons/md";
import { isDraftEmpty, conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversations, useConversation, useConversationById } from "@plugins/conversations/web";
import { isActiveStatus, postConversationTurn, stopConversation } from "@plugins/conversations/core";
import { fetchEndpoint, getEndpointErrorMessage, EndpointError } from "@plugins/infra/plugins/endpoints/web";
import { startPushAndExit } from "../../shared";
import { resumeConversationEndpoint } from "@plugins/conversations/plugins/conversation-view/plugins/resume/core";
import { exitConversation } from "@plugins/conversations/plugins/conversation-view/plugins/exit/core";
import { dropAndExit } from "@plugins/conversations/plugins/conversation-view/plugins/drop-and-exit/core";
import { toast } from "@plugins/notifications/web";
import { useDraft } from "@plugins/primitives/plugins/persistent-draft/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { pushesResource } from "@plugins/tasks/core";
import { useEditedFiles } from "@plugins/conversations/plugins/conversation-view/plugins/code/web";
import type { PromptEditorActionProps } from "@plugins/primitives/plugins/prompt-editor/web";
import { Button } from "@/components/ui/button";

type Mode = "send" | "push-and-exit" | "exit" | "drop-and-exit" | "go" | "restore" | "stop";

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
  stop: MdStop,
  go: MdPlayArrow,
  "push-and-exit": MdRocketLaunch,
  exit: MdLogout,
  "drop-and-exit": MdDeleteForever,
};

const BUTTON_CLASS: Record<Mode, string> = {
  restore: PRIMARY,
  send: PRIMARY,
  go: "gap-1.5 bg-success hover:bg-success/90 text-success-foreground",
  stop: "gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90",
  "push-and-exit": PRIMARY,
  exit: PRIMARY,
  "drop-and-exit": PRIMARY,
};

const LABELS: Record<Mode, string> = {
  restore: "Restore",
  send: "Send",
  stop: "Stop",
  go: "Go",
  "push-and-exit": "Push & Exit",
  exit: "Exit",
  "drop-and-exit": "Drop & Exit",
};

export function PushAndExitButton(_: PromptEditorActionProps) {
  const { convId } = conversationPane.useParams();
  const conversation = useConversationById(convId);
  const live = useConversation(convId) ?? conversation;

  const [draft, setDraft, clearDraft] = useDraft("conversation:prompt", "", { scope: convId });
  const [busy, setBusy] = useState(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const { files } = useEditedFiles(convId);
  const pushesResult = useResource(pushesResource);
  const conv = useConversations();
  const conversationsLoading = conv.pending;
  const active = useMemo(() => (conv.pending ? [] : conv.active), [conv]);

  const isNotRunning = live?.status === "gone" || live?.status === "done";

  const mode: Mode = useMemo(() => {
    if (!conversation || !live) return "exit";
    if (isNotRunning) return "restore";
    if (!isDraftEmpty(draft)) return "send";
    if (live.status === "working") return "stop";
    if (conversationsLoading) {
      return "push-and-exit";
    }
    if (files.length > 0) {
      if (files.every((f) => f.path.startsWith("research/"))) return "go";
      return "push-and-exit";
    }
    const pushes = pushesResult.pending ? [] : pushesResult.data;
    const hasPush = pushes.some((p) => p.attemptId === conversation.attemptId);
    if (hasPush) return "exit";
    const hasOtherActiveInWorktree = active.some(
      (c) =>
        c.id !== convId &&
        c.worktreePath === conversation.worktreePath &&
        isActiveStatus(c.status),
    );
    return hasOtherActiveInWorktree ? "exit" : "drop-and-exit";
  }, [isNotRunning, draft, files, pushesResult, active, conversationsLoading, conversation, convId, live]);

  if (!conversation || !live) return null;

  const hasSession = !!live.claudeSessionId;
  // `busy` (any in-flight POST) gives uniform double-click protection across
  // every action — the same guard `send` always relied on, now shared by all.
  const disabled = mode === "restore"
    ? busy || !hasSession
    : busy || live.status === "starting";

  function specFor(m: Mode): ActionSpec | null {
    switch (m) {
      case "restore":
        return {
          verb: "Resume",
          successToast: "Resuming conversation…",
          run: () => fetchEndpoint(resumeConversationEndpoint, { id: convId }),
        };
      case "send": {
        const current = draftRef.current;
        if (isDraftEmpty(current)) return null;
        return {
          verb: "Send",
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
          verb: "Push & Exit",
          run: () => fetchEndpoint(startPushAndExit, { id: convId }),
        };
      case "exit":
        return {
          verb: "Exit",
          successToast: "Conversation closed",
          run: () => fetchEndpoint(exitConversation, { id: convId }),
        };
      case "drop-and-exit":
        return {
          verb: "Drop & Exit",
          successToast: "Task dropped and conversation closed",
          run: async () => {
            await fetchEndpoint(dropAndExit, { id: convId });
          },
        };
    }
  }

  async function onClick() {
    if (disabled) return;
    const spec = specFor(mode);
    if (!spec) return;
    setBusy(true);
    try {
      await spec.run();
      if (spec.successToast) {
        toast({ type: "conversation", description: spec.successToast, variant: "success" });
      }
    } catch (err) {
      toast({
        type: "conversation",
        description: `${spec.verb} failed: ${endpointErrorText(err)}`,
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  const label =
    busy && mode === "send"
      ? "Sending…"
      : busy && mode === "stop"
        ? "Stopping…"
        : LABELS[mode];
  const Icon = ICONS[mode];

  return (
    <Button
      variant="default"
      size="sm"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={BUTTON_CLASS[mode]}
    >
      <Icon className="size-3.5" />
      {label}
    </Button>
  );
}
