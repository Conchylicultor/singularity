import { useRef, useState } from "react";
import { MdClose, MdImage } from "react-icons/md";
import { AttachmentUpload } from "@plugins/page/plugins/attachment-block/web";
import {
  attachmentUrl,
  Lightbox,
} from "@plugins/primitives/plugins/text-editor/plugins/paste-images/web";
import type { BlockRendererProps } from "@plugins/page/plugins/editor/web";
import { imageBlock } from "../../core";

const MIN_W = 80;
const DEFAULT_W = 480;

export function ImageBlock({ block, isFocused, editor }: BlockRendererProps) {
  const { attachmentId, width, alt } = imageBlock.parse(block.data);

  if (!attachmentId) {
    return (
      <AttachmentUpload
        accept="image/*"
        label="Add an image — click, drop, or paste"
        icon={MdImage}
        isFocused={isFocused}
        onArm={() => editor.onFocus()}
        onUploaded={(res) => editor.update({ attachmentId: res.id, width: DEFAULT_W })}
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
    <div className="px-md py-xs">
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
