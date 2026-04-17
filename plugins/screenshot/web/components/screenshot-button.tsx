import { useState } from "react";
import { MdPhotoCamera } from "react-icons/md";
import { toBlob } from "html-to-image";
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
        setBusy(true);
        try {
          const blob = await captureViewport();
          if (!blob) {
            Shell.Toast({ description: "Screenshot failed", variant: "error" });
            return;
          }

          // Best-effort clipboard copy. Some browsers / contexts deny it; we
          // continue regardless so the user still gets the new tab.
          try {
            await navigator.clipboard.write([
              new ClipboardItem({ "image/png": blob }),
            ]);
          } catch {
            /* clipboard denied; non-fatal */
          }

          const res = await fetch("/api/screenshots", {
            method: "POST",
            body: blob,
            headers: { "content-type": "image/png" },
          });
          if (!res.ok) {
            Shell.Toast({
              description: `Screenshot upload failed (${res.status})`,
              variant: "error",
            });
            return;
          }
          const { id } = (await res.json()) as { id: string };
          window.open(`/screenshot/${id}`, "_blank", "noopener");
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
      <MdPhotoCamera className={`size-4 ${busy ? "animate-pulse" : ""}`} />
    </Button>
  );
}

async function captureViewport(): Promise<Blob | null> {
  // Capture the whole document at the device pixel ratio so the PNG matches
  // what the user sees on their display.
  return toBlob(document.documentElement, {
    pixelRatio: window.devicePixelRatio || 1,
    cacheBust: true,
  });
}
