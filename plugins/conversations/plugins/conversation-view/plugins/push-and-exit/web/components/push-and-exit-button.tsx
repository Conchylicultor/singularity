import { useEffect, useMemo, useRef, useState } from "react";
import { MdDeleteForever, MdReplay, MdRocketLaunch, MdSend, MdStop } from "react-icons/md";
import { LogOut, Play } from "lucide-react";
import { isDraftEmpty, conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversations, useConversation } from "@plugins/conversations/web";
import { isActiveStatus } from "@plugins/conversations/core";
import { toast } from "@plugins/notifications/web";
import { useDraft } from "@plugins/primitives/plugins/persistent-draft/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { pushesResource } from "@plugins/tasks/core";
import { useEditedFiles } from "@plugins/conversations/plugins/conversation-view/plugins/code/web";
import type { PromptEditorActionProps } from "@plugins/primitives/plugins/prompt-editor/web";
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

type Mode = "send" | "push-and-exit" | "exit" | "drop-and-exit" | "go" | "restore" | "stop";

export function PushAndExitButton(_: PromptEditorActionProps) {
  const { conversation } = conversationPane.useData();
  const live = useConversation(conversation.id) ?? conversation;
  const jobsResult = useResource(pushAndExitResource);
  const job = jobsResult.pending ? undefined : (jobsResult.data[conversation.id] as JobState | undefined);
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

  const [draft, setDraft, clearDraft] = useDraft("conversation:prompt", "", { scope: conversation.id });
  const [sending, setSending] = useState(false);
  const [stopping, setStopping] = useState(false);
  const draftRef = useRef(draft);
  draftRef.current = draft;

  const { files } = useEditedFiles(conversation.id);
  const pushesResult = useResource(pushesResource);
  const { active, isLoading: conversationsLoading } = useConversations();

  const isNotRunning = live.status === "gone" || live.status === "done";

  const mode: Mode = useMemo(() => {
    if (isNotRunning) return "restore";
    if (!isDraftEmpty(draft)) return "send";
    if (live.status === "working" && !busy) return "stop";
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
        c.id !== conversation.id &&
        c.worktreePath === conversation.worktreePath &&
        isActiveStatus(c.status),
    );
    return hasOtherActiveInWorktree ? "exit" : "drop-and-exit";
  }, [isNotRunning, draft, files, pushesResult, active, conversationsLoading, conversation.attemptId, conversation.id, conversation.worktreePath, live.status, busy]);

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
    toast({ type: "conversation", description: "Pushed and closed", variant: "success" });
    void fetch(
      `/api/conversations/${encodeURIComponent(conversation.id)}/push-and-exit`,
      { method: "DELETE" },
    );
  }, [job?.status, conversation.id]);

  useEffect(() => {
    if (job?.status !== "error") return;
    const message = (job as Extract<JobState, { status: "error" }>).message;
    toast({
      type: "conversation",
      description: `Push & Exit failed: ${message}`,
      variant: "error",
    });
    void fetch(
      `/api/conversations/${encodeURIComponent(conversation.id)}/push-and-exit`,
      { method: "DELETE" },
    );
  }, [job, conversation.id]);

  const hasSession = !!live.claudeSessionId;
  const disabled = mode === "restore"
    ? busy || !hasSession
    : mode === "stop"
      ? stopping
      : busy || sending || live.status === "starting";

  async function onClick() {
    if (disabled) return;
    if (mode === "restore") {
      try {
        const res = await fetch(
          `/api/conversations/${encodeURIComponent(conversation.id)}/resume`,
          { method: "POST" },
        );
        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `HTTP ${res.status}`);
        }
        toast({ type: "conversation", description: "Resuming conversation…", variant: "success" });
      } catch (err) {
        toast({
          type: "conversation",
          description: `Resume failed: ${err instanceof Error ? err.message : String(err)}`,
          variant: "error",
        });
      }
      return;
    }
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
        toast({
          type: "conversation",
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
        toast({
          type: "conversation",
          description: `Go failed: ${err instanceof Error ? err.message : String(err)}`,
          variant: "error",
        });
      }
    } else if (mode === "stop") {
      setStopping(true);
      try {
        const res = await fetch(
          `/api/conversations/${encodeURIComponent(conversation.id)}/stop`,
          { method: "POST" },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { ok: boolean; rewindText: string | null };
        if (data.rewindText) setDraft(data.rewindText);
      } catch (err) {
        toast({
          type: "conversation",
          description: `Failed to stop: ${err instanceof Error ? err.message : String(err)}`,
          variant: "error",
        });
      } finally {
        setStopping(false);
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
        toast({
          type: "conversation",
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
        toast({ type: "conversation", description: "Conversation closed", variant: "success" });
      } catch (err) {
        toast({
          type: "conversation",
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
        toast({
          type: "conversation",
          description: "Task dropped and conversation closed",
          variant: "success",
        });
      } catch (err) {
        toast({
          type: "conversation",
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
      toast({ type: "conversation", description: "Conversation closed", variant: "success" });
    } catch (err) {
      toast({
        type: "conversation",
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
    mode === "restore"
      ? "Restore"
      : mode === "send"
        ? sending
          ? "Sending…"
          : "Send"
        : mode === "stop"
          ? stopping
            ? "Stopping…"
            : "Stop"
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
    mode === "restore"
      ? MdReplay
      : mode === "send"
        ? MdSend
        : mode === "stop"
          ? MdStop
          : mode === "go"
            ? Play
            : mode === "push-and-exit"
              ? MdRocketLaunch
              : mode === "exit"
                ? LogOut
                : MdDeleteForever;

  const buttonClass =
    mode === "stop"
      ? "gap-1.5 bg-destructive text-destructive-foreground hover:bg-destructive/90"
      : mode === "go"
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
