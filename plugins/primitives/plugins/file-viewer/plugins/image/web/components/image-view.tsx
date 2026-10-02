import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import {
  fileRefName,
  fileUrl,
} from "@plugins/primitives/plugins/file-viewer/core";
import type { FileRendererProps } from "@plugins/primitives/plugins/file-viewer/web";

export function ImageView({ file }: FileRendererProps) {
  return (
    <Center axis="both" className="h-full p-lg">
      <img
        src={fileUrl(file)}
        alt={fileRefName(file)}
        className="max-h-full max-w-full object-contain"
        style={{ imageRendering: "pixelated" }}
        onLoad={(e) => {
          // restore crisp rendering only for small images
          const img = e.currentTarget;
          if (img.naturalWidth > 64 || img.naturalHeight > 64) {
            img.style.imageRendering = "auto";
          }
        }}
      />
    </Center>
  );
}
