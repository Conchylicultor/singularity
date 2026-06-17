import { useEffect } from "react";
import { MdClose } from "react-icons/md";
import { ViewportOverlay } from "@plugins/primitives/plugins/css/plugins/viewport-overlay/web";
import { attachmentUrl } from "../internal/markdown";

export function Lightbox({
  attachmentId,
  alt,
  onClose,
}: {
  attachmentId: string;
  alt?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <ViewportOverlay
      layer="popover"
      onClick={onClose}
      className="flex items-center justify-center bg-black/70 p-lg backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Close"
        className="absolute top-3 right-3 flex size-8 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20"
      >
        <MdClose className="size-5" />
      </button>
      <img
        src={attachmentUrl(attachmentId)}
        alt={alt ?? "image"}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full rounded-md shadow-2xl"
      />
    </ViewportOverlay>
  );
}
