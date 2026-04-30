import { useState } from "react";
import { createPortal } from "react-dom";
import { flushSync } from "react-dom";
import { MdGesture } from "react-icons/md";
import { captureApp } from "@plugins/screenshot/web";
import { Button } from "@/components/ui/button";
import { ShellCommands } from "@plugins/shell/web";
import { uploadAttachment } from "@plugins/infra/plugins/attachments/web";
import { ImproveCommands } from "@plugins/improve/web";
import type { Stroke } from "@plugins/screenshot/plugins/draw-canvas/web";
import { LiveDrawOverlay } from "./live-draw-overlay";

export function DrawOnAppButton() {
  const [active, setActive] = useState(false);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [color, setColor] = useState("#ef4444");
  const [width, setWidth] = useState(4);
  const [busy, setBusy] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(true);

  const teardown = () => {
    setActive(false);
    setStrokes([]);
    setChromeVisible(true);
  };

  const onCancel = () => {
    if (busy) return;
    teardown();
  };

  const onDone = async () => {
    if (busy || strokes.length === 0) return;
    setBusy(true);
    try {
      flushSync(() => setChromeVisible(false));
      await new Promise<void>((r) =>
        requestAnimationFrame(() => requestAnimationFrame(() => r())),
      );
      const blob = await captureApp(
        (node: Node) =>
          !(node instanceof HTMLElement && node.dataset.drawChrome === "true"),
      );
      if (!blob) {
        ShellCommands.Toast({ description: "Capture failed", variant: "error" });
        setChromeVisible(true);
        return;
      }
      const uploaded = await uploadAttachment(blob, "drawing.png", "image/png");
      teardown();
      ImproveCommands.OpenWithAttachments({
        attachmentIds: [uploaded.id],
        filenames: { [uploaded.id]: "drawing.png" },
      });
    } catch (err) {
      ShellCommands.Toast({
        description: `Capture failed: ${(err as Error).message}`,
        variant: "error",
      });
      setChromeVisible(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        title="Draw on app"
        aria-label="Draw on app"
        disabled={active}
        onClick={() => setActive(true)}
      >
        <MdGesture className="size-4" />
      </Button>
      {active &&
        createPortal(
          <LiveDrawOverlay
            strokes={strokes}
            onStrokesChange={setStrokes}
            color={color}
            onColorChange={setColor}
            width={width}
            onWidthChange={setWidth}
            chromeVisible={chromeVisible}
            busy={busy}
            onDone={onDone}
            onCancel={onCancel}
          />,
          document.body,
        )}
    </>
  );
}
