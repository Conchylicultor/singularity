import { useState } from "react";
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
import { ImproveForm } from "./improve-form";
import type { ImproveSubmitBody, ImproveSubmitResponse } from "../../shared/types";

type Submitting = false | "create" | "sonnet" | "opus";

export function ImproveButton() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [includeUrl, setIncludeUrl] = useState(false);
  const [includeScreenshot, setIncludeScreenshot] = useState(false);
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState<Submitting>(false);

  const openForm = (next: boolean) => {
    if (next) {
      setUrl(window.location.href);
    }
    setOpen(next);
  };

  const submit = async (launch: "sonnet" | "opus" | null) => {
    const text = value.trim();
    if (!text || submitting) return;
    const phase: Submitting = launch ?? "create";
    setSubmitting(phase);
    try {
      const attachmentIds: string[] = [];
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
        text,
        url: includeUrl ? url : "",
        attachmentIds,
        launch,
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
      Shell.Toast({
        description: launch
          ? `Launched with ${launch === "sonnet" ? "Sonnet" : "Opus"}`
          : "Queued",
        variant: "success",
      });
      setValue("");
      setIncludeUrl(false);
      setIncludeScreenshot(false);
      setOpen(false);
      void json; // reserved for follow-up (navigate to conversation)
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
          value={value}
          onChange={setValue}
          includeUrl={includeUrl}
          onToggleUrl={setIncludeUrl}
          includeScreenshot={includeScreenshot}
          onToggleScreenshot={setIncludeScreenshot}
          submitting={submitting}
          onSubmit={submit}
          onCancel={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  );
}
