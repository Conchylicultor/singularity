import {
  MdAttachFile,
  MdAudiotrack,
  MdDownload,
  MdFolderZip,
  MdImage,
  MdInsertDriveFile,
  MdMovie,
  MdPictureAsPdf,
  MdSwapHoriz,
} from "react-icons/md";
import type { ComponentType } from "react";
import { AttachmentUpload } from "@plugins/page/plugins/attachment-block/web";
import { attachmentUrl } from "@plugins/primitives/plugins/text-editor/plugins/paste-images/web";
import { Card } from "@plugins/primitives/plugins/css/plugins/card/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack, Inset } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Frame } from "@plugins/primitives/plugins/css/plugins/frame/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { hoverRevealGroup, hoverRevealTarget } from "@plugins/primitives/plugins/hover-reveal/web";
import type { BlockRendererProps } from "@plugins/page/plugins/editor/web";
import { fileBlock } from "../../core";

// Humanize a byte count: B / KB / MB / GB with one decimal above bytes.
function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let value = n / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1)} ${units[unit]}`;
}

// Pick a leading icon from the file's mime type.
function iconForMime(mime: string | undefined): ComponentType<{ className?: string }> {
  const m = (mime ?? "").toLowerCase();
  if (m === "application/pdf") return MdPictureAsPdf;
  if (m.includes("zip") || m.includes("compressed") || m.includes("tar")) return MdFolderZip;
  if (m.startsWith("audio/")) return MdAudiotrack;
  if (m.startsWith("video/")) return MdMovie;
  if (m.startsWith("image/")) return MdImage;
  return MdInsertDriveFile;
}

export function FileBlock({ block, isFocused, editor }: BlockRendererProps) {
  const { attachmentId, filename, mime, size } = fileBlock.parse(block.data);

  if (!attachmentId) {
    return (
      <AttachmentUpload
        accept="*"
        label="Add a file — click, drop, or paste"
        icon={MdAttachFile}
        isFocused={isFocused}
        onArm={() => editor.onFocus()}
        onUploaded={(res) =>
          editor.update({
            attachmentId: res.id,
            filename: res.filename,
            mime: res.mime,
            size: res.size,
          })
        }
      />
    );
  }

  const Icon = iconForMime(mime);
  const name = filename ?? "File";

  return (
    <Inset x="md" y="xs">
      <div className={cn(hoverRevealGroup, "relative")}>
        <Card as="a" interactive href={attachmentUrl(attachmentId)} download={name}>
          <Frame
            gap="md"
            leading={<Icon className="size-6 text-muted-foreground" />}
            content={
              <Stack gap="none">
                <Text variant="label" className="truncate">
                  {name}
                </Text>
                {size != null ? (
                  <Text variant="caption" tone="muted">
                    {formatBytes(size)}
                  </Text>
                ) : null}
              </Stack>
            }
            trailing={<MdDownload className="size-5 text-muted-foreground" />}
          />
        </Card>
        <Pin to="top-right" offset="xs">
          <button
            type="button"
            aria-label="Replace file"
            onClick={() => editor.update({})}
            className={cn(hoverRevealTarget, "size-6 rounded-full bg-black/50 text-white hover:bg-black/70")}
          >
            <Center className="size-full">
              <MdSwapHoriz className="size-4" />
            </Center>
          </button>
        </Pin>
      </div>
    </Inset>
  );
}
