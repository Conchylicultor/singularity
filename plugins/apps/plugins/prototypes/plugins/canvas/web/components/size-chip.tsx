import type { ReactElement } from "react";
import {
  MdComputer,
  MdDesktopWindows,
  MdLaptop,
  MdOutlineDescription,
  MdPhoneIphone,
  MdSwapHoriz,
  MdTabletMac,
} from "react-icons/md";
import { Fill } from "@plugins/primitives/plugins/css/plugins/fill/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Slider } from "@plugins/primitives/plugins/css/plugins/slider/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  ControlPanel,
  ControlPanelPopover,
} from "@plugins/primitives/plugins/css/plugins/control-panel/web";
import { SIZE_PRESETS, type CanvasSize } from "../internal/canvas-model";
import {
  MAX_ZOOM,
  MIN_ZOOM,
  sizeName,
  zoomFromPercent,
  type FrameLayout,
} from "../internal/layout";
import { usePrototypeDetail } from "../context";

/**
 * Size, zoom and Whole page: ONE chip for the whole canvas ("Responsive
 * 1280 × 800 | Fit · 62%"), opening a menu with the size presets, the zoom (Fit,
 * a 10–200% slider, and a value box that jumps to 100%) and the Whole page
 * switch. Every frame follows it.
 *
 * `layout` is what the canvas computed — the logical size and scale the chip
 * reports; it is handed in rather than recomputed so the chip and the frames
 * can never disagree.
 */
export function SizeChip({ layout }: { layout: FrameLayout }): ReactElement {
  const { canvas, dispatch } = usePrototypeDetail();
  const { size, zoom, wholePage } = canvas;
  const percent = Math.round(layout.scale * 100);
  const zoomLabel =
    zoom === "fit" ? `Fit · ${String(percent)}%` : `${String(percent)}%`;

  return (
    <ControlPanelPopover
      side="top"
      align="end"
      size="menu"
      label="Size and zoom"
      trigger={
        <Button variant="floating" aria-label="Size and zoom">
          <SizeIcon size={size} />
          <span>{sizeName(size)}</span>
          <span className="tabular-nums text-muted-foreground">
            {layout.width} × {layout.height}
          </span>
          <span aria-hidden className="h-3.5 w-px bg-border" />
          <span className="tabular-nums">{zoomLabel}</span>
          {wholePage ? (
            <MdOutlineDescription
              className="text-primary"
              aria-label="Whole page"
            />
          ) : null}
        </Button>
      }
    >
      <ControlPanel>
        <ControlPanel.Section
          label="Size"
          description="Or drag a frame's right edge for any width."
        >
          <ControlPanel.Row
            select="radio"
            checked={size.kind === "responsive"}
            trailing="fills the canvas"
            onSelect={() =>
              dispatch({ type: "setSize", size: { kind: "responsive" } })
            }
          >
            Responsive
          </ControlPanel.Row>
          {SIZE_PRESETS.map((p) => (
            <ControlPanel.Row
              key={p.name}
              select="radio"
              checked={size.kind === "preset" && size.preset === p.name}
              trailing={`${String(p.w)} × ${String(p.h)}`}
              onSelect={() =>
                dispatch({
                  type: "setSize",
                  size: { kind: "preset", preset: p.name },
                })
              }
            >
              {p.name}
            </ControlPanel.Row>
          ))}
          {size.kind === "custom" ? (
            <ControlPanel.Row
              select="radio"
              checked
              trailing={`${String(size.w)} × ${String(size.h)}`}
            >
              Custom
            </ControlPanel.Row>
          ) : null}
        </ControlPanel.Section>
        <ControlPanel.Section label="Zoom">
          <Stack direction="row" gap="sm" align="center">
            <Button
              variant={zoom === "fit" ? "secondary" : "outline"}
              aria-pressed={zoom === "fit"}
              title="The whole frame visible at once"
              onClick={() => dispatch({ type: "setZoom", zoom: "fit" })}
            >
              Fit
            </Button>
            <Fill>
              <Slider
                aria-label="Zoom"
                className="w-full"
                min={MIN_ZOOM * 100}
                max={MAX_ZOOM * 100}
                step={1}
                detent={100}
                value={percent}
                onValueChange={(v) =>
                  dispatch({ type: "setZoom", zoom: zoomFromPercent(v) })
                }
              />
            </Fill>
            <Button
              variant={zoom === 1 ? "secondary" : "outline"}
              aria-pressed={zoom === 1}
              aria-label="Actual size"
              title="Actual size"
              className="w-14 tabular-nums"
              onClick={() => dispatch({ type: "setZoom", zoom: 1 })}
            >
              {percent}%
            </Button>
          </Stack>
        </ControlPanel.Section>
        <ControlPanel.Section>
          <ControlPanel.Row
            select="switch"
            checked={wholePage}
            icon={<MdOutlineDescription />}
            hint="Show the entire page content, not just one screen."
            onSelect={() => dispatch({ type: "setWholePage", on: !wholePage })}
          >
            Whole page
          </ControlPanel.Row>
        </ControlPanel.Section>
      </ControlPanel>
    </ControlPanelPopover>
  );
}

/** The chip's leading glyph for the size in force. */
function SizeIcon({ size }: { size: CanvasSize }): ReactElement {
  switch (size.kind) {
    case "responsive":
      return <MdSwapHoriz />;
    case "preset": {
      const preset = size.preset;
      return preset === "Phone" ? (
        <MdPhoneIphone />
      ) : preset === "Tablet" ? (
        <MdTabletMac />
      ) : preset === "Laptop" ? (
        <MdLaptop />
      ) : preset === "Wide" ? (
        <MdComputer />
      ) : (
        <MdDesktopWindows />
      );
    }
    case "custom":
      return <MdDesktopWindows />;
  }
}
