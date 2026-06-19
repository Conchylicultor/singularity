import { useState } from "react";
import { MdClose } from "react-icons/md";
import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
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
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className={cn(hoverRevealTarget, "bg-background/90 border-border text-foreground absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full border")}
          aria-label="Remove image"
        >
          <MdClose className="size-3" />
        </button>
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
