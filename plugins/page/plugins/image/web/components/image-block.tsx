import { cn } from "@plugins/primitives/plugins/ui-kit/web";
import { useCallback, useEffect, useRef, useState } from "react";
import { MdClose, MdImage } from "react-icons/md";
import { uploadAttachment } from "@plugins/infra/plugins/attachments/web";
import {
  attachmentUrl,
  Lightbox,
} from "@plugins/primitives/plugins/text-editor/plugins/paste-images/web";
import { Placeholder } from "@plugins/primitives/plugins/placeholder/web";
import type { BlockRendererProps } from "@plugins/page/plugins/editor/web";
import { imageBlock } from "../../core";

const MIN_W = 80;
const DEFAULT_W = 480;

export function ImageBlock({ block, isFocused, editor }: BlockRendererProps) {
  const { attachmentId, width, alt } = imageBlock.parse(block.data);

  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Funnel for all three inputs (picker / drop / paste). Validates the mime,
  // uploads via the attachments primitive, then persists the new attachment id
  // and a default width immediately (emits blocksChanged → reconcile job).
  const ingest = useCallback(
    async (file: File | Blob) => {
      if (!file.type?.startsWith("image/")) {
        setError("Only image files are supported.");
        return;
      }
      setError(null);
      setUploading(true);
      try {
        const filename = file instanceof File ? file.name : "image";
        const res = await uploadAttachment(file, filename, file.type);
        editor.update({ attachmentId: res.id, width: DEFAULT_W });
      } catch (e) {
        // Fail loud — surface the upload error, never swallow it.
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setUploading(false);
      }
    },
    [editor],
  );

  if (!attachmentId) {
    return (
      <EmptyImageBlock
        isFocused={isFocused}
        uploading={uploading}
        error={error}
        onArm={() => editor.onFocus()}
        ingest={ingest}
      />
    );
  }

  return (
    <FilledImageBlock
      attachmentId={attachmentId}
      width={width ?? DEFAULT_W}
      alt={alt}
      editor={editor}
    />
  );
}

function EmptyImageBlock({
  isFocused,
  uploading,
  error,
  onArm,
  ingest,
}: {
  isFocused: boolean;
  uploading: boolean;
  error: string | null;
  onArm: () => void;
  ingest: (file: File | Blob) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  // Paste listener, armed only while this empty block is focused. Keyed by the
  // editor's existing focus model so at most one block's listener is live.
  useEffect(() => {
    if (!isFocused) return;
    function onPaste(e: ClipboardEvent) {
      const items = Array.from(e.clipboardData?.items ?? []).filter(
        (it) => it.kind === "file" && it.type.startsWith("image/"),
      );
      const item = items.find((it) => it.type === "image/png") ?? items[0];
      if (!item) return;
      const file = item.getAsFile();
      if (!file) return;
      e.preventDefault();
      ingest(file);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [isFocused, ingest]);

  return (
    <div className="px-3 py-1">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Reset so the same file can be re-selected later.
          e.target.value = "";
          if (file) ingest(file);
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
          if (file) ingest(file);
        }}
        className={cn(
          "flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-3 py-4 text-body text-muted-foreground transition-colors hover:bg-muted",
          dragOver && "border-primary bg-muted",
        )}
      >
        <MdImage className="size-4 shrink-0" />
        <span>{uploading ? "Uploading…" : "Add an image — click, drop, or paste"}</span>
      </div>
    </div>
  );
}

function FilledImageBlock({
  attachmentId,
  width,
  alt,
  editor,
}: {
  attachmentId: string;
  width: number;
  alt?: string;
  editor: BlockRendererProps["editor"];
}) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [liveWidth, setLiveWidth] = useState<number | null>(null);
  const [lightbox, setLightbox] = useState(false);

  const displayWidth = liveWidth ?? width;

  function onResizePointerDown(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    const handle = e.currentTarget as HTMLElement;
    handle.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startWidth = width;
    const maxWidth = wrapperRef.current?.parentElement?.clientWidth ?? Infinity;

    let nextWidth = startWidth;
    function onMove(ev: PointerEvent) {
      const raw = startWidth + (ev.clientX - startX);
      nextWidth = Math.round(Math.min(Math.max(raw, MIN_W), maxWidth));
      setLiveWidth(nextWidth);
    }
    function onUp(ev: PointerEvent) {
      handle.releasePointerCapture(ev.pointerId);
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      setLiveWidth(null);
      editor.update({ attachmentId, width: nextWidth, alt });
    }
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
  }

  return (
    <div className="px-3 py-1">
      <div
        ref={wrapperRef}
        className="group relative inline-block max-w-full"
        style={{ width: displayWidth }}
      >
        <img
          src={attachmentUrl(attachmentId)}
          alt={alt ?? ""}
          onClick={() => setLightbox(true)}
          className="block w-full cursor-zoom-in rounded-md"
        />
        <button
          type="button"
          aria-label="Remove image"
          onClick={() => editor.update({ alt })}
          className="absolute top-1 right-1 flex size-6 items-center justify-center rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/70"
        >
          <MdClose className="size-4" />
        </button>
        <div
          aria-label="Resize image"
          role="slider"
          onPointerDown={onResizePointerDown}
          className="absolute top-0 right-0 h-full w-2 cursor-ew-resize"
        >
          <div className="absolute top-1/2 right-0.5 h-8 w-1 -translate-y-1/2 rounded-md bg-foreground/30 opacity-0 transition-opacity group-hover:opacity-100" />
        </div>
      </div>
      {lightbox ? (
        <Lightbox attachmentId={attachmentId} alt={alt} onClose={() => setLightbox(false)} />
      ) : null}
    </div>
  );
}
