import { useRef, useState, type ReactElement } from "react";
import { MdUpload } from "react-icons/md";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import {
  ControlPanel,
  ControlPanelPopover,
} from "@plugins/primitives/plugins/css/plugins/control-panel/web";
import { uploadAttachment } from "@plugins/infra/plugins/attachments/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Spinner } from "@plugins/primitives/plugins/css/plugins/spinner/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import type { PageCover } from "@plugins/page/plugins/editor/core";
import { COVER_GRADIENTS } from "./cover-presets";

/**
 * The cover chooser: a gradient gallery plus an image upload. Picking either
 * commits a new {@link PageCover} via `onPick` and closes the popover. Mirrors
 * the image-block upload funnel (mime-validate → uploadAttachment).
 *
 * A `ControlPanelPopover size="picker"`: the gradient tiles land on the same
 * left edge as the "Gradient" label above them because the panel owns the
 * content inset, and Upload is a FOOTER ROW rather than a button in the body,
 * with a leading `icon` like every footer in the vocabulary (invariant #4). It
 * costs nothing here: the footer is the only row in this panel, so the icon
 * column it opens is the column that row itself paints in.
 */
export function ChangeCoverPopover({
  trigger,
  current,
  onPick,
}: {
  trigger: ReactElement;
  current: PageCover | null | undefined;
  onPick: (cover: PageCover) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedPreset = current?.type === "gradient" ? current.preset : null;

  const commit = (cover: PageCover) => {
    void onPick(cover);
    setOpen(false);
  };

  const ingest = async (file: File) => {
    if (!file.type?.startsWith("image/")) {
      setError("Only image files are supported.");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const res = await uploadAttachment(file, file.name, file.type);
      commit({ type: "image", attachmentId: res.id, positionY: 50 });
    } catch (e) {
      // Fail loud — surface the upload error, never swallow it.
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploading(false);
    }
  };

  return (
    <ControlPanelPopover
      open={open}
      onOpenChange={setOpen}
      size="picker"
      align="start"
      label="Change cover"
      trigger={trigger}
    >
      <ControlPanel.Section label="Gradient">
        <Stack direction="row" gap="xs" wrap>
          {COVER_GRADIENTS.map((g) => {
            const selected = g.id === selectedPreset;
            return (
              <button
                key={g.id}
                type="button"
                aria-label={g.label}
                aria-pressed={selected}
                title={g.label}
                onClick={() => commit({ type: "gradient", preset: g.id })}
                style={{ background: g.css }}
                className={cn(
                  "h-10 w-12 rounded-md border border-border transition-transform hover:scale-105",
                  selected &&
                    "ring-2 ring-ring ring-offset-1 ring-offset-background",
                )}
              />
            );
          })}
        </Stack>
      </ControlPanel.Section>

      <ControlPanel.Footer>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) void ingest(file);
          }}
        />
        <ControlPanel.Row
          disabled={uploading}
          onSelect={() => inputRef.current?.click()}
          icon={uploading ? <Spinner /> : <MdUpload />}
        >
          {uploading ? "Uploading…" : "Upload an image"}
        </ControlPanel.Row>
        {error ? <Placeholder tone="error">{error}</Placeholder> : null}
      </ControlPanel.Footer>
    </ControlPanelPopover>
  );
}
