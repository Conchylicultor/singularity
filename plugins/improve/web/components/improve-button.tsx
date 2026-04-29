import { useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { domToBlob } from "modern-screenshot";
import { MdAdd } from "react-icons/md";
import { ShellCommands as Shell } from "@plugins/shell/web";
import { uploadAttachment } from "@plugins/infra/plugins/attachments/web";
import { buttonVariants } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ImproveForm,
  type CardDraft,
  type PrefilledAttachment,
} from "./improve-form";
import type { ChainModel } from "./model-chip";
import { Improve } from "../commands";
import type {
  ImproveSubmitBody,
  ImproveSubmitCard,
  ImproveSubmitResponse,
} from "../../shared/types";

const HEAD_DEFAULT_MODEL: ChainModel = "sonnet";

function makeCard(model: ChainModel): CardDraft {
  return { localId: crypto.randomUUID(), text: "", model };
}

function freshCards(): CardDraft[] {
  return [makeCard(HEAD_DEFAULT_MODEL)];
}

export function ImproveButton() {
  const [open, setOpen] = useState(false);
  const [cards, setCards] = useState<CardDraft[]>(freshCards);
  const [autoFocusId, setAutoFocusId] = useState<string | null>(null);
  const [includeUrl, setIncludeUrl] = useState(false);
  const [includeScreenshot, setIncludeScreenshot] = useState(false);
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [prefilled, setPrefilled] = useState<PrefilledAttachment[]>([]);

  Improve.OpenWithAttachments.useHandler(({ attachmentIds, filenames }) => {
    setPrefilled(
      attachmentIds.map((id) => ({
        id,
        filename: filenames?.[id] ?? "attachment",
      })),
    );
    setUrl(window.location.href);
    setOpen(true);
  });

  // When cards length grows, focus the freshly-added card. We identify it as
  // the first card whose localId we hadn't seen before. Pure inserts at any
  // position are covered; reorders don't add new ids so they don't trigger.
  const seenIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const seen = seenIdsRef.current;
    let newest: string | null = null;
    for (const c of cards) {
      if (!seen.has(c.localId)) newest = c.localId;
    }
    seenIdsRef.current = new Set(cards.map((c) => c.localId));
    if (newest) setAutoFocusId(newest);
  }, [cards]);

  const openForm = (next: boolean) => {
    if (next) {
      setUrl(window.location.href);
      // Re-seed seen ids so the head card receives initial focus on open.
      seenIdsRef.current = new Set();
    } else {
      setPrefilled([]);
    }
    setOpen(next);
  };

  const resetForm = () => {
    setCards(freshCards());
    setIncludeUrl(false);
    setIncludeScreenshot(false);
    setPrefilled([]);
    seenIdsRef.current = new Set();
  };

  const submit = async () => {
    if (submitting) return;
    const trimmed = cards.map((c) => ({ ...c, text: c.text.trim() }));
    if (trimmed.some((c) => !c.text)) return;

    setSubmitting(true);
    try {
      const attachmentIds: string[] = [...prefilled.map((p) => p.id)];
      if (includeScreenshot) {
        // Close the popover BEFORE capture so it isn't in the screenshot. Two
        // rAFs let the close paint; same pattern as plugins/screenshot.
        flushSync(() => setOpen(false));
        await new Promise<void>((r) =>
          requestAnimationFrame(() => requestAnimationFrame(() => r())),
        );
        const blob = await domToBlob(document.documentElement, {
          scale: window.devicePixelRatio || 1,
        });
        if (!blob) {
          Shell.Toast({ description: "Screenshot failed", variant: "error" });
          return;
        }
        const uploaded = await uploadAttachment(blob, "page.png", "image/png");
        attachmentIds.push(uploaded.id);
      }

      const body: ImproveSubmitBody = {
        cards: trimmed.map<ImproveSubmitCard>((c) => ({
          text: c.text,
          launch: c.model === "queue" ? null : c.model,
        })),
        url: includeUrl ? url : "",
        attachmentIds,
      };
      const res = await fetch("/api/improve/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const msg = await res.text().catch(() => "");
        Shell.Toast({
          description: `Submit failed${msg ? `: ${msg}` : ""}`,
          variant: "error",
        });
        return;
      }
      const json = (await res.json()) as ImproveSubmitResponse;
      const launchedCount = trimmed.filter((c) => c.model !== "queue").length;
      const description =
        trimmed.length === 1
          ? launchedCount === 1
            ? `Launched with ${trimmed[0]!.model === "sonnet" ? "Sonnet" : "Opus"}`
            : "Queued"
          : launchedCount === 0
            ? `Queued ${trimmed.length} tasks`
            : `Chained ${trimmed.length} tasks (${launchedCount} armed)`;
      Shell.Toast({ description, variant: "success" });
      void json;
      resetForm();
      setOpen(false);
    } catch (err) {
      Shell.Toast({
        description: `Submit failed: ${(err as Error).message}`,
        variant: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={openForm}>
      <PopoverTrigger className={buttonVariants({ variant: "outline", size: "sm" })}>
        <MdAdd className="size-4" />
        Improve
      </PopoverTrigger>
      <PopoverContent>
        <ImproveForm
          cards={cards}
          onCardsChange={setCards}
          autoFocusId={autoFocusId}
          onAutoFocusHandled={() => setAutoFocusId(null)}
          includeUrl={includeUrl}
          onToggleUrl={setIncludeUrl}
          includeScreenshot={includeScreenshot}
          onToggleScreenshot={setIncludeScreenshot}
          prefilledAttachments={prefilled}
          submitting={submitting}
          onSubmit={submit}
          onCancel={() => openForm(false)}
        />
      </PopoverContent>
    </Popover>
  );
}
