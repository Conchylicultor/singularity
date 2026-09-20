import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { codeImageUrl } from "@plugins/code-explorer/plugins/code-api/core";

export function ImageView({
  worktree,
  path,
}: {
  worktree: string;
  path: string;
}) {
  const src = codeImageUrl(worktree, path);
  return (
    <Center axis="both" className="h-full p-lg">
      <img
        src={src}
        alt={path.slice(path.lastIndexOf("/") + 1)}
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
