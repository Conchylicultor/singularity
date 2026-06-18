import { useEffect, useState } from "react";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Clip } from "@plugins/primitives/plugins/css/plugins/clip/web";
import { Column } from "@plugins/primitives/plugins/css/plugins/column/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";

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
      ? "border-destructive/40 bg-destructive/5"
      : "border-success/40 bg-success/5";
  return (
    <Clip fill className={`rounded-md border ${border}`}>
      <Column
        className="h-full"
        header={
          <Text as="div" variant="caption" className="border-b px-md py-xs font-medium text-muted-foreground">
            {label}
          </Text>
        }
        body={
          <Center axis="both" className="h-full p-lg">
            <img
              src={src}
              alt={label}
              className="max-h-full max-w-full object-contain"
            />
          </Center>
        }
        scrollBody={false}
      />
    </Clip>
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
      <Loading className="px-md py-sm" />
    );
  }

  // Added (no old version)
  if (oldStatus === "missing" && newStatus === "ok") {
    return (
      <Center axis="both" className="h-full p-lg">
        <img
          src={newSrc}
          alt={path.slice(path.lastIndexOf("/") + 1)}
          className="max-h-full max-w-full object-contain"
        />
      </Center>
    );
  }

  // Deleted (no new version)
  if (oldStatus === "ok" && newStatus === "missing") {
    return (
      <Center axis="both" className="h-full p-lg opacity-50">
        <img
          src={oldSrc}
          alt={path.slice(path.lastIndexOf("/") + 1)}
          className="max-h-full max-w-full object-contain"
        />
      </Center>
    );
  }

  if (oldStatus === "missing" && newStatus === "missing") {
    return (
      <Text as="div" variant="body" className="px-md py-sm text-destructive">Image not found.</Text>
    );
  }

  // Modified: side-by-side
  return (
    <Stack direction="row" gap="sm" className="h-full p-lg">
      <Panel label={ref} src={oldSrc} side="old" />
      <Panel label="Working tree" src={newSrc} side="new" />
    </Stack>
  );
}
