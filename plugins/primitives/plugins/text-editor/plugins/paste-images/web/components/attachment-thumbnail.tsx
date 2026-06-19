import { useState } from "react";
import { MdClose } from "react-icons/md";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Pin } from "@plugins/primitives/plugins/css/plugins/pin/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { hoverRevealGroup, hoverRevealTarget } from "@plugins/primitives/plugins/hover-reveal/web";
import { attachmentUrl } from "../internal/markdown";
import { Lightbox } from "./lightbox";

export function AttachmentThumbnail({
  attachmentId,
  alt,
  onRemove,
  expandable = true,
  size = "sm",
}: {
  attachmentId: string;
  alt?: string;
  onRemove?: () => void;
  expandable?: boolean;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const sizeClass =
    size === "md"
      ? "max-h-32 max-w-full object-contain"
      : "max-h-16 max-w-32 object-cover";

  return (
    <span className={cn(hoverRevealGroup, "relative inline-block")} contentEditable={false}>
      {expandable ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
          className="block cursor-zoom-in"
          aria-label="Expand image"
        >
          <img
            src={attachmentUrl(attachmentId)}
            alt={alt ?? "attachment"}
            className={`${sizeClass} rounded-md border border-border`}
            draggable={false}
          />
        </button>
      ) : (
        <img
          src={attachmentUrl(attachmentId)}
          alt={alt ?? "attachment"}
          className={`${sizeClass} rounded-md border border-border`}
          draggable={false}
        />
      )}
      {onRemove && (
        <Pin to="top-right" offset="xs" outset>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className={cn(hoverRevealTarget, "bg-background/90 border-border text-foreground block size-4 rounded-full border")}
            aria-label="Remove image"
          >
            <Center className="size-full">
              <MdClose className="size-3" />
            </Center>
          </button>
        </Pin>
      )}
      {open && (
        <Lightbox
          attachmentId={attachmentId}
          alt={alt}
          onClose={() => setOpen(false)}
        />
      )}
    </span>
  );
}
