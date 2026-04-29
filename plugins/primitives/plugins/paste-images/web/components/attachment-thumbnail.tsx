import { useState } from "react";
import { MdClose } from "react-icons/md";
import { attachmentUrl } from "../../shared";
import { Lightbox } from "./lightbox";

// Inline image thumbnail with optional remove × and click-to-expand lightbox.
// Used both inside the Lexical editor (when an `ImageNode` decorates) and
// anywhere else that wants to render an attachment image consistently.
//
// Sizing defaults to the inline-prompt size (`max-h-16 max-w-32`); pass
// `size="md"` for larger previews (used in the Improve form's pre-fill row).
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
    <span className="group relative inline-block" contentEditable={false}>
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
            className={`${sizeClass} rounded border border-border`}
            draggable={false}
          />
        </button>
      ) : (
        <img
          src={attachmentUrl(attachmentId)}
          alt={alt ?? "attachment"}
          className={`${sizeClass} rounded border border-border`}
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
          className="bg-background/90 border-border text-foreground absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full border opacity-0 transition-opacity group-hover:opacity-100"
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
