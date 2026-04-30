import { useEffect, useState } from "react";

type ImgStatus = "loading" | "ok" | "missing";

function useImageStatus(src: string): ImgStatus {
  const [status, setStatus] = useState<ImgStatus>("loading");
  useEffect(() => {
    setStatus("loading");
    const img = new Image();
    img.onload = () => setStatus("ok");
    img.onerror = () => setStatus("missing");
    img.src = src;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [src]);
  return status;
}

function imageUrl(worktree: string, path: string, ref?: string): string {
  const base = `/api/code/${encodeURIComponent(worktree)}/image?path=${encodeURIComponent(path)}`;
  return ref ? `${base}&ref=${encodeURIComponent(ref)}` : base;
}

function Panel({
  label,
  src,
  side,
}: {
  label: string;
  src: string;
  side: "old" | "new";
}) {
  const border =
    side === "old"
      ? "border-red-500/40 bg-red-500/5"
      : "border-green-500/40 bg-green-500/5";
  return (
    <div className={`flex flex-1 flex-col overflow-hidden rounded border ${border}`}>
      <div className="border-b px-3 py-1 text-xs font-medium text-muted-foreground">
        {label}
      </div>
      <div className="flex flex-1 items-center justify-center overflow-auto p-4">
        <img
          src={src}
          alt={label}
          className="max-h-full max-w-full object-contain"
        />
      </div>
    </div>
  );
}

export function ImageDiffView({
  worktree,
  path,
  base,
}: {
  worktree: string;
  path: string;
  base?: string;
}) {
  const ref = base ?? "HEAD";
  const oldSrc = imageUrl(worktree, path, ref);
  const newSrc = imageUrl(worktree, path);

  const oldStatus = useImageStatus(oldSrc);
  const newStatus = useImageStatus(newSrc);

  if (oldStatus === "loading" || newStatus === "loading") {
    return (
      <div className="px-3 py-2 text-sm text-muted-foreground">Loading…</div>
    );
  }

  // Added (no old version)
  if (oldStatus === "missing" && newStatus === "ok") {
    return (
      <div className="flex h-full items-center justify-center overflow-auto p-4">
        <img
          src={newSrc}
          alt={path.slice(path.lastIndexOf("/") + 1)}
          className="max-h-full max-w-full object-contain"
        />
      </div>
    );
  }

  // Deleted (no new version)
  if (oldStatus === "ok" && newStatus === "missing") {
    return (
      <div className="flex h-full items-center justify-center overflow-auto p-4 opacity-50">
        <img
          src={oldSrc}
          alt={path.slice(path.lastIndexOf("/") + 1)}
          className="max-h-full max-w-full object-contain"
        />
      </div>
    );
  }

  if (oldStatus === "missing" && newStatus === "missing") {
    return (
      <div className="px-3 py-2 text-sm text-destructive">Image not found.</div>
    );
  }

  // Modified: side-by-side
  return (
    <div className="flex h-full gap-2 p-4">
      <Panel label={ref} src={oldSrc} side="old" />
      <Panel label="Working tree" src={newSrc} side="new" />
    </div>
  );
}
