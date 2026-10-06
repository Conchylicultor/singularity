import { useState } from "react";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import {
  fileRefName,
  fileUrl,
} from "@plugins/primitives/plugins/file-viewer/core";
import type { FileRendererProps } from "@plugins/primitives/plugins/file-viewer/web";
import { ImageViewer } from "@plugins/primitives/plugins/overlay/plugins/image-viewer/web";
import { useFolderImages } from "../internal/use-folder-images";

/**
 * The fitted preview; a click opens the app's full-screen image viewer over
 * every image in the file's folder, ← / → stepping between them.
 */
export function ImageView({ file }: FileRendererProps) {
  const src = fileUrl(file);
  const name = fileRefName(file);
  const images = useFolderImages(file);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  // The image on screen, by address: the folder listing can change under an
  // open viewer, so an index would drift.
  const [viewing, setViewing] = useState<string | null>(null);
  const index =
    viewing === null ? -1 : images.findIndex((i) => i.src === viewing);

  return (
    <Center axis="both" className="h-full p-lg">
      <img
        ref={setImg}
        src={src}
        alt={name}
        className="max-h-full max-w-full cursor-zoom-in object-contain"
        style={{ imageRendering: "pixelated" }}
        aria-haspopup="dialog"
        onClick={() => setViewing(src)}
        onLoad={(e) => {
          // restore crisp rendering only for small images
          const el = e.currentTarget;
          if (el.naturalWidth > 64 || el.naturalHeight > 64) {
            el.style.imageRendering = "auto";
          }
        }}
      />
      {index >= 0 && (
        <ImageViewer
          images={images}
          index={index}
          onIndexChange={(i) => setViewing(images[i]?.src ?? null)}
          onClose={() => setViewing(null)}
          // Only the previewed image has a place on the page to grow out of
          // and shrink back into; its siblings fade.
          originOf={(i) => (images[i]?.src === src ? img : null)}
        />
      )}
    </Center>
  );
}
