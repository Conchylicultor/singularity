import { useState } from "react";
import { flushSync } from "react-dom";
import { MdPhotoCamera } from "react-icons/md";
import { domToBlob } from "modern-screenshot";
import { Button } from "@/components/ui/button";
import { Shell } from "@plugins/shell/web/commands";

export function ScreenshotButton() {
  const [busy, setBusy] = useState(false);

  return (
    <Button
      variant="ghost"
      size="icon"
      title="Screenshot"
      aria-label="Screenshot"
      disabled={busy}
      onClick={async () => {
        // flushSync + two rAFs guarantees the disabled state is committed
        // AND painted before domToBlob blocks the main thread (CSS
        // animations would freeze while blocked, so we only rely on the
        // static `disabled:opacity-50` from the Button variant).
        flushSync(() => setBusy(true));
        await new Promise<void>((r) =>
          requestAnimationFrame(() => requestAnimationFrame(() => r())),
        );
        try {
          const blob = await domToBlob(document.documentElement, {
            scale: window.devicePixelRatio || 1,
          });
          if (!blob) {
            Shell.Toast({ description: "Screenshot failed", variant: "error" });
            return;
          }
          const id = crypto.randomUUID();
          window.open(`/screenshot/${id}`, "_blank", "noopener");
          void upload(id, blob);
        } catch (err) {
          Shell.Toast({
            description: `Screenshot failed: ${(err as Error).message}`,
            variant: "error",
          });
        } finally {
          setBusy(false);
        }
      }}
    >
      <MdPhotoCamera className="size-4" />
    </Button>
  );
}

async function upload(id: string, blob: Blob): Promise<void> {
  // Fire clipboard copy and server upload in parallel. A clipboard permission
  // prompt must not block the upload — otherwise the just-opened tab sits on
  // "Loading…" until the user dismisses it.
  void navigator.clipboard
    .write([new ClipboardItem({ "image/png": blob })])
    .catch(() => {
      /* clipboard denied; non-fatal */
    });

  try {
    const res = await fetch(`/api/screenshots/${id}`, {
      method: "POST",
      body: blob,
      headers: { "content-type": "image/png" },
    });
    if (!res.ok) {
      Shell.Toast({
        description: `Screenshot upload failed (${res.status})`,
        variant: "error",
      });
    }
  } catch (err) {
    Shell.Toast({
      description: `Screenshot upload failed: ${(err as Error).message}`,
      variant: "error",
    });
  }
}
