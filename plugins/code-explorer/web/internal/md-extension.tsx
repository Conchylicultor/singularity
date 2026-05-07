import type { Components } from "react-markdown";
import { useWorktreeContext } from "./worktree-context";
import { useFileOpen } from "@plugins/primitives/plugins/file-links/web";

const IMG_HREF_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico)(?:[?#].*)?$/i;

function isExternalUrl(src: string): boolean {
  return (
    src.startsWith("http://") ||
    src.startsWith("https://") ||
    src.startsWith("data:")
  );
}

export function useImageProxyComponents(): Partial<Components> {
  const worktree = useWorktreeContext();
  const onFileOpen = useFileOpen();

  if (!worktree) return {};
  return {
    img: ({ src, alt }) => {
      if (typeof src !== "string" || !src) return null;
      const isImage = IMG_HREF_RE.test(src);
      if (isExternalUrl(src) && isImage) {
        return (
          <img
            src={src}
            alt={alt ?? ""}
            className="my-2 max-w-full rounded border border-border"
          />
        );
      }
      if (isImage) {
        const apiSrc = `/api/code/${encodeURIComponent(worktree)}/image?path=${encodeURIComponent(src)}`;
        return (
          <img
            src={apiSrc}
            alt={alt ?? ""}
            className="my-2 max-w-full rounded border border-border"
          />
        );
      }
      if (onFileOpen) {
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onFileOpen(src);
            }}
            className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-primary hover:underline"
          >
            {alt || src}
          </button>
        );
      }
      return null;
    },
  };
}
