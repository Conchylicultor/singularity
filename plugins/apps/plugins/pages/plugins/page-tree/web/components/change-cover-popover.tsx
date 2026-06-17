import { useRef, useState, type ReactElement } from "react";
import { MdUpload } from "react-icons/md";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  Button,
  cn,
} from "@plugins/primitives/plugins/ui-kit/web";
import { uploadAttachment } from "@plugins/infra/plugins/attachments/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { SectionLabel } from "@plugins/primitives/plugins/css/plugins/section-label/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import type { PageCover } from "@plugins/page/plugins/editor/core";
import { COVER_GRADIENTS } from "./cover-presets";

/**
 * The cover chooser: a gradient gallery plus an image upload. Picking either
 * commits a new {@link PageCover} via `onPick` and closes the popover. Mirrors
 * the image-block upload funnel (mime-validate → uploadAttachment).
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
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={trigger} />
      <PopoverContent className="w-80 p-sm" align="start">
        <Stack gap="sm">
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
          <SectionLabel>Gradient</SectionLabel>
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
                    selected && "ring-2 ring-ring ring-offset-1 ring-offset-background",
                  )}
                />
              );
            })}
          </Stack>
          <SectionLabel>Upload</SectionLabel>
          <Button
            variant="secondary"
            size="sm"
            loading={uploading}
            onClick={() => inputRef.current?.click()}
          >
            <MdUpload />
            {uploading ? "Uploading…" : "Upload an image"}
          </Button>
          {error ? <Placeholder tone="error">{error}</Placeholder> : null}
        </Stack>
      </PopoverContent>
    </Popover>
  );
}
