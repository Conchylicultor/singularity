import { useEffect } from "react";
import { MdRocketLaunch } from "react-icons/md";
import type { ConversationState } from "@plugins/conversations/plugins/conversation-view/web/slots";
import { useConversation } from "@plugins/conversations/web/use-conversations";
import { Shell } from "@plugins/shell/web/commands";
import { useResource } from "@core";
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

export function PushAndExitButton({
  conversation,
}: {
  conversation: ConversationState;
}) {
  const live = useConversation(conversation.id) ?? conversation;
  const { data: jobs } = useResource(pushAndExitResource);
  const job = jobs?.[conversation.id] as JobState | undefined;
  const busy = job?.status === "running";

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

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        title="Push & Exit"
        aria-label="Push & Exit"
        disabled={disabled}
        onClick={onClick}
        className="gap-1.5"
      >
        <MdRocketLaunch
          className={`size-4 ${busy ? "animate-pulse" : ""}`}
        />
        {busy ? "Pushing…" : "Push & Exit"}
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
