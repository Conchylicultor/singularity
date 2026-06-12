export function ImageView({
  worktree,
  path,
}: {
  worktree: string;
  path: string;
}) {
  const src = `/api/code/${encodeURIComponent(worktree)}/image?path=${encodeURIComponent(path)}`;
  return (
    <div className="flex h-full items-center justify-center overflow-auto p-lg">
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
    </div>
  );
}
