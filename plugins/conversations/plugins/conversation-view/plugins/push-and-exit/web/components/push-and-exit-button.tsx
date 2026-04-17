import { useEffect, useRef, useState } from "react";
import { MdRocketLaunch } from "react-icons/md";
import type { ConversationState } from "@plugins/conversations/plugins/conversation-view/web/slots";
import { useConversation } from "@plugins/conversations/web/use-conversations";
import { Shell } from "@plugins/shell/web/commands";
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
  CLEAN_TOKEN,
  FLAG_TOKEN,
  PUSH_AND_EXIT_PROMPT,
} from "../prompt";

type Phase = "idle" | "armed" | "running" | "fetching" | "result";

type Verdict =
  | { kind: "clean"; text: string }
  | { kind: "flag"; text: string }
  | { kind: "missing"; text: string };

interface Turn {
  at: string;
  role: "user" | "assistant";
  text: string;
  stopReason?: string;
  messageId?: string;
}

function interpret(turnText: string): Verdict {
  const trimmed = turnText.replace(/\s+$/, "");
  const lines = trimmed.split("\n");
  const last = lines[lines.length - 1]?.trim() ?? "";
  const rest = lines.slice(0, -1).join("\n").trim();
  if (last === CLEAN_TOKEN) return { kind: "clean", text: rest };
  if (last === FLAG_TOKEN) return { kind: "flag", text: rest };
  return { kind: "missing", text: trimmed };
}

function navigateHome() {
  history.pushState({}, "", "/");
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function PushAndExitButton({
  conversation,
}: {
  conversation: ConversationState;
}) {
  // Subscribe to the live conversation so we observe status transitions.
  const live = useConversation(conversation.id) ?? conversation;
  const status = live.status;

  const [phase, setPhase] = useState<Phase>("idle");
  const triggeredAtRef = useRef<string | null>(null);
  const [verdict, setVerdict] = useState<Verdict | null>(null);

  // Phase transitions driven off conversation.status.
  useEffect(() => {
    if (phase === "armed" && status === "working") setPhase("running");
    else if (phase === "running" && status !== "working") setPhase("fetching");
  }, [phase, status]);

  // On fetching: read transcript turns, pick last assistant end_turn, classify.
  useEffect(() => {
    if (phase !== "fetching") return;
    const since = triggeredAtRef.current;
    if (!since) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/conversations/${encodeURIComponent(conversation.id)}/turns?since=${encodeURIComponent(since)}`,
        );
        if (!res.ok) throw new Error(`turns fetch failed: ${res.status}`);
        const { turns } = (await res.json()) as { turns: Turn[] };
        const finalAsst = [...turns]
          .reverse()
          .find((t) => t.role === "assistant" && t.stopReason === "end_turn");
        if (cancelled) return;
        if (!finalAsst) {
          setVerdict({
            kind: "missing",
            text: "Couldn't find Claude's final message in the transcript.",
          });
          setPhase("result");
          return;
        }
        const v = interpret(finalAsst.text);
        setVerdict(v);
        if (v.kind === "clean") {
          await fetch(
            `/api/conversations/${encodeURIComponent(conversation.id)}/close`,
            { method: "POST" },
          ).catch(() => {});
          if (cancelled) return;
          Shell.Toast({
            description: "Pushed and closed",
            variant: "success",
          });
          setPhase("idle");
          triggeredAtRef.current = null;
          navigateHome();
        } else {
          setPhase("result");
        }
      } catch (err) {
        if (cancelled) return;
        Shell.Toast({
          description: `Push & Exit failed: ${err instanceof Error ? err.message : String(err)}`,
          variant: "error",
        });
        setPhase("idle");
        triggeredAtRef.current = null;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [phase, conversation.id]);

  const busy = phase !== "idle" && phase !== "result";
  const disabled = busy || status === "gone" || status === "starting";

  async function onClick() {
    if (disabled) return;
    triggeredAtRef.current = new Date().toISOString();
    setPhase("armed");
    try {
      const res = await fetch(
        `/api/conversations/${encodeURIComponent(conversation.id)}/turn`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: PUSH_AND_EXIT_PROMPT }),
        },
      );
      if (!res.ok) throw new Error(`turn POST failed: ${res.status}`);
    } catch (err) {
      Shell.Toast({
        description: `Push & Exit failed: ${err instanceof Error ? err.message : String(err)}`,
        variant: "error",
      });
      setPhase("idle");
      triggeredAtRef.current = null;
    }
  }

  async function onClose() {
    try {
      await fetch(
        `/api/conversations/${encodeURIComponent(conversation.id)}/close`,
        { method: "POST" },
      );
      Shell.Toast({ description: "Conversation closed", variant: "success" });
      setPhase("idle");
      setVerdict(null);
      triggeredAtRef.current = null;
      navigateHome();
    } catch (err) {
      Shell.Toast({
        description: `Close failed: ${err instanceof Error ? err.message : String(err)}`,
        variant: "error",
      });
    }
  }

  function onKeepOpen() {
    setPhase("idle");
    setVerdict(null);
    triggeredAtRef.current = null;
  }

  const showDialog = phase === "result" && verdict !== null;

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
            <SheetTitle>
              {verdict?.kind === "flag"
                ? "Push complete — with notes"
                : verdict?.kind === "clean"
                  ? "Pushed"
                  : "Couldn't parse Claude's response"}
            </SheetTitle>
            <SheetDescription>
              {verdict?.kind === "missing"
                ? "Claude didn't end with a recognized sentinel — showing its raw final message below."
                : "Claude flagged the following. Review before closing."}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-auto px-4 pb-2">
            <pre className="whitespace-pre-wrap text-sm font-sans">
              {verdict?.text}
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
