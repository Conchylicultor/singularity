import { useEffect, useMemo, useRef, useState } from "react";
import { MdDeleteForever, MdRocketLaunch, MdSend } from "react-icons/md";
import { LogOut, Play } from "lucide-react";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { isDraftEmpty } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversations, useConversation } from "@plugins/conversations/web";
import { isActiveStatus } from "@plugins/conversations/core";
import { ShellCommands as Shell } from "@plugins/shell/web";
import { useDraft } from "@plugins/primitives/plugins/persistent-draft/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { pushesResource } from "@plugins/tasks/core";
import { useEditedFiles } from "@plugins/conversations/plugins/conversation-view/plugins/code/web";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  pushAndExitResource,
  type JobState,
} from "../../shared/resources";

type Mode = "send" | "push-and-exit" | "exit" | "drop-and-exit" | "go";

export function PushAndExitButton({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  const live = useConversation(conversation.id) ?? conversation;
  const { data: jobs } = useResource(pushAndExitResource);
  const job = jobs[conversation.id] as JobState | undefined;
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (job) setPending(false);
  }, [job]);

  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setPending(false), 10_000);
    return () => clearTimeout(timer);
  }, [pending]);

  const busy = pending || job?.status === "running";

  const [draft, , clearDraft] = useDraft("conversation:prompt", "", { scope: conversation.id });
  const [sending, setSending] = useState(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const { files } = useEditedFiles(conversation.id);
  const { data: pushes } = useResource(pushesResource);
  const { active, isLoading: conversationsLoading } = useConversations();

  const mode: Mode = useMemo(() => {
    if (!isDraftEmpty(draft)) return "send";
    // Until every input has loaded, default to "push-and-exit" — the safe
    // assumption (treat the conversation as if it has unpushed work) and
    // prevents the label from flickering through "Drop & Exit" / "Exit"
    // while resources stream in.
    if (conversationsLoading) {
      return "push-and-exit";
    }
    if (files.length > 0) {
      if (files.every((f) => f.path.startsWith("research/"))) return "go";
      return "push-and-exit";
    }
    const hasPush = pushes.some((p) => p.attemptId === conversation.attemptId);
    if (hasPush) return "exit";
    const hasOtherActiveInWorktree = active.some(
      (c) =>
        c.id !== conversation.id &&
        c.worktreePath === conversation.worktreePath &&
        isActiveStatus(c.status),
    );
    return hasOtherActiveInWorktree ? "exit" : "drop-and-exit";
  }, [draft, files, pushes, active, conversationsLoading, conversation.attemptId, conversation.id, conversation.worktreePath]);

  useEffect(() => {
    if (!busy) return;
    if (isActiveStatus(live.status)) return;
    void fetch(
      `/api/conversations/${encodeURIComponent(conversation.id)}/push-and-exit`,
      { method: "DELETE" },
    );
  }, [busy, live.status, conversation.id]);

  useEffect(() => {
    if (job?.status !== "clean") return;
    Shell.Toast({ description: "Pushed and closed", variant: "success" });
    void fetch(
      `/api/conversations/${encodeURIComponent(conversation.id)}/push-and-exit`,
      { method: "DELETE" },
    );
  }, [job?.status, conversation.id]);

  useEffect(() => {
    if (job?.status !== "error") return;
    const message = (job as Extract<JobState, { status: "error" }>).message;
    Shell.Toast({
      description: `Push & Exit failed: ${message}`,
      variant: "error",
    });
    void fetch(
      `/api/conversations/${encodeURIComponent(conversation.id)}/push-and-exit`,
      { method: "DELETE" },
    );
  }, [job, conversation.id]);

  const disabled = busy || sending || live.status === "gone" || live.status === "done" || live.status === "starting";

  async function onClick() {
    if (disabled) return;
    if (mode === "send") {
      const current = draftRef.current;
      if (isDraftEmpty(current)) return;
      setSending(true);
      try {
        const res = await fetch(
          `/api/conversations/${encodeURIComponent(conversation.id)}/turn`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ text: current }),
          },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        clearDraft();
      } catch (err) {
        Shell.Toast({
          description: `Failed to send: ${err instanceof Error ? err.message : String(err)}`,
          variant: "error",
        });
      } finally {
        setSending(false);
      }
    } else if (mode === "go") {
      try {
        const res = await fetch(
          `/api/conversations/${encodeURIComponent(conversation.id)}/turn`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ text: "Go" }),
          },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (err) {
        Shell.Toast({
          description: `Go failed: ${err instanceof Error ? err.message : String(err)}`,
          variant: "error",
        });
      }
    } else if (mode === "push-and-exit") {
      setPending(true);
      try {
        const res = await fetch(
          `/api/conversations/${encodeURIComponent(conversation.id)}/push-and-exit`,
          { method: "POST" },
        );
        if (!res.ok && res.status !== 409) {
          setPending(false);
          throw new Error(`HTTP ${res.status}`);
        }
      } catch (err) {
        setPending(false);
        Shell.Toast({
          description: `Push & Exit failed: ${err instanceof Error ? err.message : String(err)}`,
          variant: "error",
        });
      }
    } else if (mode === "exit") {
      try {
        const res = await fetch(
          `/api/conversations/${encodeURIComponent(conversation.id)}/exit`,
          { method: "POST" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        Shell.Toast({ description: "Conversation closed", variant: "success" });
      } catch (err) {
        Shell.Toast({
          description: `Exit failed: ${err instanceof Error ? err.message : String(err)}`,
          variant: "error",
        });
      }
    } else {
      try {
        const res = await fetch(
          `/api/conversations/${encodeURIComponent(conversation.id)}/drop-and-exit`,
          { method: "POST" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        Shell.Toast({
          description: "Task dropped and conversation closed",
          variant: "success",
        });
      } catch (err) {
        Shell.Toast({
          description: `Drop & Exit failed: ${err instanceof Error ? err.message : String(err)}`,
          variant: "error",
        });
      }
    }
  }

  async function onClose() {
    try {
      await fetch(
        `/api/conversations/${encodeURIComponent(conversation.id)}/close`,
        { method: "POST" },
      );
      await fetch(
        `/api/conversations/${encodeURIComponent(conversation.id)}/push-and-exit`,
        { method: "DELETE" },
      );
      Shell.Toast({ description: "Conversation closed", variant: "success" });
    } catch (err) {
      Shell.Toast({
        description: `Close failed: ${err instanceof Error ? err.message : String(err)}`,
        variant: "error",
      });
    }
  }

  function onKeepOpen() {
    void fetch(
      `/api/conversations/${encodeURIComponent(conversation.id)}/push-and-exit`,
      { method: "DELETE" },
    );
  }

  const showDialog = job?.status === "flag";
  const flagText =
    job?.status === "flag"
      ? (job as Extract<JobState, { status: "flag" }>).text
      : undefined;

  const label =
    mode === "send"
      ? sending
        ? "Sending…"
        : "Send"
      : mode === "go"
        ? "Go"
        : mode === "push-and-exit"
          ? busy
            ? "Pushing…"
            : "Push & Exit"
          : mode === "exit"
            ? "Exit"
            : "Drop & Exit";

  const Icon =
    mode === "send"
      ? MdSend
      : mode === "go"
        ? Play
        : mode === "push-and-exit"
          ? MdRocketLaunch
          : mode === "exit"
            ? LogOut
            : MdDeleteForever;

  const buttonClass =
    mode === "go"
      ? "gap-1.5 bg-[oklch(0.44_0.13_145)] hover:bg-[oklch(0.50_0.13_145)] text-white"
      : "gap-1.5 bg-[oklch(0.44_0.09_240)] hover:bg-[oklch(0.5_0.09_240)] text-white";
  const buttonVariant = "default" as const;

  return (
    <>
      <Button
        variant={buttonVariant}
        size="sm"
        title={label}
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        className={buttonClass}
      >
        <Icon className={`size-3.5 ${busy ? "animate-pulse" : ""}`} />
        {label}
      </Button>

      <Sheet
        open={showDialog}
        onOpenChange={(open: boolean) => {
          if (!open) onKeepOpen();
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Push complete — with notes</SheetTitle>
            <SheetDescription>
              Claude flagged the following. Review before closing.
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-auto px-4 pb-2">
            <pre className="whitespace-pre-wrap text-sm font-sans">
              {flagText}
            </pre>
          </div>
          <SheetFooter className="flex-row justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={onKeepOpen}>
              Keep open
            </Button>
            <Button variant="default" size="sm" onClick={onClose}>
              Close conversation
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
