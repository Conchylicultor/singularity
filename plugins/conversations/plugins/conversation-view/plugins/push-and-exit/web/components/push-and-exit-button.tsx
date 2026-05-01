import { useEffect, useMemo } from "react";
import { MdDeleteForever, MdRocketLaunch } from "react-icons/md";
import { LogOut } from "lucide-react";
import type { ConversationRecord } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversations, useConversation } from "@plugins/conversations/web";
import { isActiveStatus } from "@plugins/conversations/shared";
import { ShellCommands as Shell } from "@plugins/shell/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { pushesResource } from "@plugins/tasks/shared";
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

type Mode = "push-and-exit" | "exit" | "drop-and-exit";

export function PushAndExitButton({
  conversation,
}: {
  conversation: ConversationRecord;
}) {
  const live = useConversation(conversation.id) ?? conversation;
  const { data: jobs } = useResource(pushAndExitResource);
  const job = jobs?.[conversation.id] as JobState | undefined;
  const busy = job?.status === "running";

  const { files } = useEditedFiles(conversation.id);
  const { data: pushes } = useResource(pushesResource);
  const { active } = useConversations();

  const mode: Mode = useMemo(() => {
    const hasEditedFiles = files !== null && files.length > 0;
    if (hasEditedFiles) return "push-and-exit";
    const hasPush = (pushes ?? []).some(
      (p) => p.attemptId === conversation.attemptId,
    );
    if (hasPush) return "exit";
    const hasOtherActiveInWorktree = active.some(
      (c) =>
        c.id !== conversation.id &&
        c.worktreePath === conversation.worktreePath &&
        isActiveStatus(c.status),
    );
    return hasOtherActiveInWorktree ? "exit" : "drop-and-exit";
  }, [files, pushes, active, conversation.attemptId, conversation.id, conversation.worktreePath]);

  useEffect(() => {
    if (job?.status !== "clean") return;
    Shell.Toast({ description: "Pushed and closed", variant: "success" });
    fetch(
      `/api/conversations/${encodeURIComponent(conversation.id)}/push-and-exit`,
      { method: "DELETE" },
    ).catch(() => {});
  }, [job?.status]);

  useEffect(() => {
    if (job?.status !== "error") return;
    const message = (job as Extract<JobState, { status: "error" }>).message;
    Shell.Toast({
      description: `Push & Exit failed: ${message}`,
      variant: "error",
    });
    fetch(
      `/api/conversations/${encodeURIComponent(conversation.id)}/push-and-exit`,
      { method: "DELETE" },
    ).catch(() => {});
  }, [job?.status]);

  const disabled = busy || live.status === "gone" || live.status === "starting";

  async function onClick() {
    if (disabled) return;
    if (mode === "push-and-exit") {
      try {
        const res = await fetch(
          `/api/conversations/${encodeURIComponent(conversation.id)}/push-and-exit`,
          { method: "POST" },
        );
        if (!res.ok && res.status !== 409) {
          throw new Error(`HTTP ${res.status}`);
        }
      } catch (err) {
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
    fetch(
      `/api/conversations/${encodeURIComponent(conversation.id)}/push-and-exit`,
      { method: "DELETE" },
    ).catch(() => {});
  }

  const showDialog = job?.status === "flag";
  const flagText =
    job?.status === "flag"
      ? (job as Extract<JobState, { status: "flag" }>).text
      : undefined;

  const label =
    mode === "push-and-exit"
      ? busy
        ? "Pushing…"
        : "Push & Exit"
      : mode === "exit"
        ? "Exit"
        : "Drop & Exit";

  const Icon =
    mode === "push-and-exit"
      ? MdRocketLaunch
      : mode === "exit"
        ? LogOut
        : MdDeleteForever;

  const buttonClass =
    "gap-1.5 bg-[oklch(0.44_0.09_240)] hover:bg-[oklch(0.5_0.09_240)] text-white";
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
