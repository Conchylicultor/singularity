import { useEffect } from "react";
import { createPortal } from "react-dom";
import { MdClose } from "react-icons/md";
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

  return createPortal(
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
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
        className="max-h-full max-w-full rounded shadow-2xl"
      />
    </div>,
    document.body,
  );
}
