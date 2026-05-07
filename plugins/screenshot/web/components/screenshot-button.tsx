import { useState } from "react";
import { flushSync } from "react-dom";
import { MdPhotoCamera } from "react-icons/md";
import { IconButton } from "@plugins/primitives/plugins/icon-button/web";
import { ShellCommands } from "@plugins/shell/web";
import { captureApp } from "../capture";

export function ScreenshotButton() {
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    // flushSync + two rAFs: commit the disabled state and let it paint
    // before domToBlob blocks the main thread.
    flushSync(() => setBusy(true));
    await new Promise<void>((r) =>
      requestAnimationFrame(() => requestAnimationFrame(() => r())),
    );
    try {
      // Capture while the tab is still in the foreground.  Opening the
      // new tab first would background this tab, which causes Chrome to
      // pause SVG rasterization (the <img> load event that
      // modern-screenshot relies on never fires in a hidden tab).
      const blob = await captureApp();
      if (!blob) {
        ShellCommands.Toast({ description: "Screenshot failed", variant: "error" });
        return;
      }

      const id = crypto.randomUUID();

      // Open the tab after capture — typically < 2 s after the click,
      // well within Chrome's 5-second user-activation window.
      window.open(`/screenshot/${id}`, "_blank", "noopener");

      // Deliver blob directly via BroadcastChannel so the new tab
      // displays the screenshot without waiting for the server roundtrip.
      // Use request-response: broadcast immediately (fast tab) AND reply
      // to "ready" pings from tabs that load after the first broadcast.
      const ch = new BroadcastChannel(`screenshot:${id}`);
      ch.postMessage(blob);
      ch.onmessage = (e: MessageEvent) => {
        if (e.data === "ready") ch.postMessage(blob);
      };
      // Stop listening after the tab has had time to receive the blob.
      setTimeout(() => ch.close(), 15_000);

      void upload(id, blob);
    } catch (err) {
      ShellCommands.Toast({
        description: `Screenshot failed: ${(err as Error).message}`,
        variant: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <IconButton
      icon={MdPhotoCamera}
      label="Screenshot"
      disabled={busy}
      onClick={handleClick}
    />
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
      ShellCommands.Toast({
        description: `Screenshot upload failed (${res.status})`,
        variant: "error",
      });
    }
  } catch (err) {
    ShellCommands.Toast({
      description: `Screenshot upload failed: ${(err as Error).message}`,
      variant: "error",
    });
  }
}
