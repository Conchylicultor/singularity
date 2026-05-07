import { useState } from "react";

export function ReadImageView({
  worktree,
  filePath,
}: {
  worktree: string;
  filePath: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const src = `/api/code/${encodeURIComponent(worktree)}/image?path=${encodeURIComponent(filePath)}`;
  const alt = filePath.slice(filePath.lastIndexOf("/") + 1);

  return (
    <button
      type="button"
      onClick={() => setExpanded((v) => !v)}
      className="block max-w-full"
      aria-label={expanded ? "Collapse image" : "Expand image"}
    >
      <img
        src={src}
        alt={alt}
        className={
          expanded
            ? "max-h-[80vh] max-w-full rounded border border-border object-contain"
            : "max-h-32 max-w-xs rounded border border-border object-cover"
        }
        style={expanded ? undefined : { imageRendering: "pixelated" }}
        onLoad={(e) => {
          const img = e.currentTarget;
          if (img.naturalWidth > 64 || img.naturalHeight > 64) {
            img.style.imageRendering = "auto";
          }
        }}
      />
    </button>
  );
}
