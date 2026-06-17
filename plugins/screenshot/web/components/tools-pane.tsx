import { Button, cn } from "@plugins/primitives/plugins/ui-kit/web";
import {
  MdContentCopy,
  MdCrop,
  MdDownload,
  MdEdit,
  MdRefresh,
  MdPanTool,
  MdUndo,
} from "react-icons/md";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";

export type Tool = "none" | "crop" | "draw";

export interface DrawSettings {
  color: string;
  width: number;
}

const COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#a855f7", "#000000", "#ffffff"];

interface Props {
  tool: Tool;
  onToolChange: (t: Tool) => void;
  drawSettings: DrawSettings;
  onDrawSettingsChange: (s: DrawSettings) => void;
  hasStrokes: boolean;
  onApplyDraw: () => void;
  onClearStrokes: () => void;
  onUndoStroke: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onReset: () => void;
}

export function ToolsPane(props: Props) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Text as="div" variant="label" className="border-b px-md py-sm">
        Tools
      </Text>

      <div className="border-b p-md">
        <div className="grid grid-cols-3 gap-xs">
          <ToolButton
            active={props.tool === "none"}
            onClick={() => props.onToolChange("none")}
            label="View"
            icon={<MdPanTool className="size-4" />}
          />
          <ToolButton
            active={props.tool === "crop"}
            onClick={() => props.onToolChange("crop")}
            label="Crop"
            icon={<MdCrop className="size-4" />}
          />
          <ToolButton
            active={props.tool === "draw"}
            onClick={() => props.onToolChange("draw")}
            label="Draw"
            icon={<MdEdit className="size-4" />}
          />
        </div>
      </div>

      {props.tool === "crop" && (
        <div className="border-b p-md">
          <Text as="div" variant="caption" tone="muted">
            Drag a rectangle on the image to crop.
          </Text>
        </div>
      )}

      {props.tool === "draw" && (
        <div
          // eslint-disable-next-line spacing/no-adhoc-spacing -- space-y on a bordered padded section; no named space-y utility, can't be a clean Stack
          className="space-y-3 border-b p-md"
        >
          <div>
            {/* eslint-disable-next-line spacing/no-adhoc-spacing -- single-edge offset below the section label */}
            <Text as="div" variant="label" tone="muted" className="mb-1">
              Color
            </Text>
            <div className="flex flex-wrap gap-xs">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Color ${c}`}
                  onClick={() => props.onDrawSettingsChange({ ...props.drawSettings, color: c })}
                  className={cn(
                    "size-6 rounded-full border-2 transition",
                    props.drawSettings.color === c
                      ? "border-foreground scale-110"
                      : "border-border",
                  )}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div>
            <Text
              as="div"
              variant="label"
              tone="muted"
              // eslint-disable-next-line spacing/no-adhoc-spacing -- single-edge offset below the width label row
              className="mb-1 flex items-center justify-between"
            >
              <span>Width</span>
              <span>{props.drawSettings.width}px</span>
            </Text>
            <input
              type="range"
              min={1}
              max={20}
              step={1}
              value={props.drawSettings.width}
              onChange={(e) =>
                props.onDrawSettingsChange({
                  ...props.drawSettings,
                  width: Number(e.target.value),
                })
              }
              className="w-full"
            />
          </div>
          <div className="flex gap-sm">
            <Button size="sm" onClick={props.onApplyDraw} disabled={!props.hasStrokes}>
              Apply
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={props.onUndoStroke}
              disabled={!props.hasStrokes}
            >
              <MdUndo className="size-4" />
              Undo
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={props.onClearStrokes}
              disabled={!props.hasStrokes}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* eslint-disable-next-line spacing/no-adhoc-spacing -- space-y on a bordered padded footer; no named space-y utility, can't be a clean Stack */}
      <div className="mt-auto space-y-2 border-t p-md">
        <Button variant="outline" size="sm" className="w-full" onClick={props.onCopy}>
          <MdContentCopy className="size-4" />
          Copy to clipboard
        </Button>
        <Button variant="outline" size="sm" className="w-full" onClick={props.onDownload}>
          <MdDownload className="size-4" />
          Download PNG
        </Button>
        <Button variant="ghost" size="sm" className="w-full" onClick={props.onReset}>
          <MdRefresh className="size-4" />
          Reset to original
        </Button>
      </div>
    </div>
  );
}

function ToolButton({
  active,
  onClick,
  label,
  icon,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}) {
  return (
    <Button
      variant={active ? "secondary" : "ghost"}
      size="sm"
      onClick={onClick}
      className="flex h-auto flex-col gap-2xs py-sm"
    >
      {icon}
      <span className="text-3xs">{label}</span>
    </Button>
  );
}
