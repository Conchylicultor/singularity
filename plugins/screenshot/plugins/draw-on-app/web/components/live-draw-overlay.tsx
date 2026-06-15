import { Button, cn } from "@plugins/primitives/plugins/ui-kit/web";
import { useEffect, useState } from "react";
import { MdClear, MdUndo } from "react-icons/md";
import { DrawCanvas, type Stroke } from "@plugins/screenshot/plugins/draw-canvas/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { ViewportOverlay } from "@plugins/primitives/plugins/viewport-overlay/web";

const COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#000000", "#ffffff"];

export interface LiveDrawOverlayProps {
  strokes: Stroke[];
  onStrokesChange: (s: Stroke[] | ((prev: Stroke[]) => Stroke[])) => void;
  color: string;
  onColorChange: (c: string) => void;
  width: number;
  onWidthChange: (w: number) => void;
  chromeVisible: boolean;
  busy: boolean;
  onDone: () => void;
  onCancel: () => void;
}

export function LiveDrawOverlay({
  strokes,
  onStrokesChange,
  color,
  onColorChange,
  width,
  onWidthChange,
  chromeVisible,
  busy,
  onDone,
  onCancel,
}: LiveDrawOverlayProps) {
  const [viewport, setViewport] = useState(() => ({
    w: window.innerWidth,
    h: window.innerHeight,
  }));

  useEffect(() => {
    const onResize = () =>
      setViewport({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Drive viewport-rect at 1:1 so strokes map to CSS pixels exactly.
  const displayed = new DOMRect(0, 0, viewport.w, viewport.h);
  const natural = { w: viewport.w, h: viewport.h };

  return (
    <ViewportOverlay layer="draw">
      <DrawCanvas
        displayed={displayed}
        natural={natural}
        strokes={strokes}
        onStrokesChange={onStrokesChange}
        color={color}
        width={width}
      />

      {chromeVisible && (
        <>
          <div
            data-draw-chrome="true"
            className="absolute left-1/2 top-4 -translate-x-1/2 flex items-center gap-md rounded-lg border bg-background/95 px-md py-sm shadow-lg backdrop-blur"
          >
            <div className="flex items-center gap-xs">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Color ${c}`}
                  onClick={() => onColorChange(c)}
                  className={cn(
                    "size-5 rounded-full border-2 transition",
                    color === c ? "border-foreground scale-110" : "border-border",
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <div className="flex items-center gap-sm">
              <Text as="span" variant="label" tone="muted">
                {width}px
              </Text>
              <input
                type="range"
                min={1}
                max={20}
                step={1}
                value={width}
                onChange={(e) => onWidthChange(Number(e.target.value))}
                className="w-24"
              />
            </div>
            <div className="flex items-center gap-xs">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onStrokesChange((s) => s.slice(0, -1))}
                disabled={strokes.length === 0}
                title="Undo"
                aria-label="Undo"
              >
                <MdUndo className="size-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onStrokesChange([])}
                disabled={strokes.length === 0}
                title="Clear"
                aria-label="Clear"
              >
                <MdClear className="size-4" />
              </Button>
            </div>
          </div>

          <div
            data-draw-chrome="true"
            className="absolute bottom-4 right-4 flex items-center gap-sm"
          >
            <Button variant="outline" size="sm" onClick={onCancel} loading={busy}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={onDone}
              loading={busy}
              disabled={strokes.length === 0}
            >
              Done
            </Button>
          </div>
        </>
      )}
    </ViewportOverlay>
  );
}
