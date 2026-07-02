import { useState, type ReactNode } from "react";
import {
  MdInsertDriveFile,
  MdImage,
  MdPictureAsPdf,
  MdVideoFile,
  MdAudioFile,
  MdArchive,
  MdDescription,
} from "react-icons/md";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Spinner } from "@plugins/primitives/plugins/css/plugins/spinner/web";
import type { MailAttachment } from "@plugins/apps/plugins/mail/plugins/mail-core/core";
import { mailAttachmentUrl } from "../../core";
import { useMailAttachment } from "../internal/use-mail-attachment";
import { formatBytes } from "../internal/format-bytes";

/**
 * Render a Material MIME-type icon element. Returns an element (not a component
 * type) so callers never create a component during render (which would reset
 * state and trips the `react-hooks/static-components` rule).
 */
function mimeIcon(mime: string): ReactNode {
  const cls = "icon-auto";
  if (mime.startsWith("image/")) return <MdImage className={cls} />;
  if (mime.startsWith("video/")) return <MdVideoFile className={cls} />;
  if (mime.startsWith("audio/")) return <MdAudioFile className={cls} />;
  if (mime === "application/pdf") return <MdPictureAsPdf className={cls} />;
  if (
    mime.includes("zip") ||
    mime.includes("compressed") ||
    mime.includes("tar") ||
    mime.includes("gzip")
  ) {
    return <MdArchive className={cls} />;
  }
  if (mime.startsWith("text/") || mime.includes("document"))
    return <MdDescription className={cls} />;
  return <MdInsertDriveFile className={cls} />;
}

export interface AttachmentChipProps {
  attachment: MailAttachment;
}

/**
 * A downloadable attachment chip: MIME icon + filename + human size. Clicking
 * downloads the bytes on demand (a spinner shows while in flight), then opens the
 * resulting same-origin URL in a new tab. A already-stored attachment resolves
 * instantly with no server round-trip.
 */
export function AttachmentChip({ attachment }: AttachmentChipProps) {
  const { download } = useMailAttachment();
  const [pending, setPending] = useState(false);

  async function open() {
    if (pending) return;
    setPending(true);
    try {
      const url = attachment.storedAttachmentId
        ? mailAttachmentUrl(attachment.storedAttachmentId)
        : await download(attachment.id);
      window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setPending(false);
    }
  }

  return (
    <Badge
      as="button"
      type="button"
      shape="pill"
      variant="muted"
      title={attachment.filename}
      onClick={() => {
        void open();
      }}
      icon={
        pending ? <Spinner className="icon-auto" /> : mimeIcon(attachment.mimeType)
      }
    >
      {attachment.filename} · {formatBytes(attachment.sizeBytes)}
    </Badge>
  );
}
