import { cn } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ComponentType } from "react";
import {
  uploadAttachment,
  type UploadedAttachment,
} from "@plugins/infra/plugins/attachments/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";

// Turn an `accept` spec into a mime predicate: `"*"` → always; `"image/*"` →
// prefix match; an exact mime → equality.
function matchesAccept(accept: string, mime: string): boolean {
  if (accept === "*") return true;
  if (accept.endsWith("/*")) return mime.startsWith(accept.slice(0, -1));
  return mime === accept;
}

// Reusable empty-state upload funnel for attachment-owning page blocks. Owns
// the click/drop/paste inputs, the uploading/error state, and validates the
// file mime against `accept` before uploading via the attachments primitive.
// The parent persists the result (e.g. via `editor.update`) from `onUploaded`.
export function AttachmentUpload({
  accept,
  label,
  icon: Icon,
  isFocused,
  onArm,
  onUploaded,
}: {
  accept: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  isFocused: boolean;
  onArm: () => void;
  onUploaded: (res: UploadedAttachment) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Funnel for all three inputs (picker / drop / paste). Validates the mime,
  // uploads via the attachments primitive, then hands the result to the parent.
  const ingest = useCallback(
    async (file: File | Blob) => {
      if (!matchesAccept(accept, file.type ?? "")) {
        setError("Unsupported file type.");
        return;
      }
      setError(null);
      setUploading(true);
      try {
        const filename = file instanceof File ? file.name : "file";
        const res = await uploadAttachment(file, filename, file.type);
        onUploaded(res);
      } catch (e) {
        // Fail loud — surface the upload error, never swallow it.
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setUploading(false);
      }
    },
    [accept, onUploaded],
  );

  // Paste listener, armed only while this empty block is focused. Keyed by the
  // editor's existing focus model so at most one block's listener is live.
  useEffect(() => {
    if (!isFocused) return;
    function onPaste(e: ClipboardEvent) {
      const items = Array.from(e.clipboardData?.items ?? []).filter(
        (it) => it.kind === "file" && matchesAccept(accept, it.type),
      );
      const item = items.find((it) => it.type === "image/png") ?? items[0];
      if (!item) return;
      const file = item.getAsFile();
      if (!file) return;
      e.preventDefault();
      void ingest(file);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [isFocused, accept, ingest]);

  return (
    <div className="px-md py-xs">
      <input
        ref={inputRef}
        type="file"
        accept={accept === "*" ? undefined : accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Reset so the same file can be re-selected later.
          e.target.value = "";
          if (file) void ingest(file);
        }}
      />
      {error ? <Placeholder tone="error">{error}</Placeholder> : null}
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          onArm();
          if (!uploading) inputRef.current?.click();
        }}
        onFocus={onArm}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!uploading) inputRef.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files?.[0];
          if (file) void ingest(file);
        }}
        className={cn(
          "flex cursor-pointer items-center gap-sm rounded-md border border-dashed border-border px-md py-lg text-body text-muted-foreground transition-colors hover:bg-muted",
          dragOver && "border-primary bg-muted",
        )}
      >
        <Icon className="size-4 shrink-0" />
        <span>{uploading ? "Uploading…" : label}</span>
      </div>
    </div>
  );
}
