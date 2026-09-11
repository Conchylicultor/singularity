import { useMemo, type ReactNode } from "react";
import { LinkChip } from "@plugins/primitives/plugins/css/plugins/link-chip/web";
import { ViewerThumbnail } from "@plugins/primitives/plugins/overlay/plugins/image-viewer/web";
import {
  MarkdownEnhancementContext,
  useMarkdownEnhancement,
  type MarkdownEnhancement,
} from "@plugins/primitives/plugins/markdown/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { conversationPane } from "@plugins/conversations/plugins/conversation-view/web";
import { useConversationById } from "@plugins/conversations/web";
import { filePeekPane } from "@plugins/conversations/plugins/conversation-view/plugins/code/plugins/file-pane/web";
import { taskDetailPane } from "@plugins/tasks/plugins/task-detail/web";

const IMG_HREF_RE = /\.(png|jpe?g|gif|webp|svg|bmp|avif|ico)(?:[?#].*)?$/i;

function isExternalUrl(src: string): boolean {
  return (
    src.startsWith("http://") ||
    src.startsWith("https://") ||
    src.startsWith("data:")
  );
}

/** The file name a markdown image's address ends in — `IMG_HREF_RE` has
 *  already required an image extension there. */
function basename(src: string): string {
  const path = src.replace(/[?#].*$/, "");
  return path.slice(path.lastIndexOf("/") + 1);
}

export function ImgEnhancer({ children }: { children: ReactNode }) {
  const convId = conversationPane.useRouteEntry()?.params.convId ?? null;
  const conversation = useConversationById(convId);
  const taskEntry = taskDetailPane.useRouteEntry();
  const openPane = useOpenPane();
  const worktree = conversation?.attemptId ?? (taskEntry ? "main" : undefined);

  const onFileOpen = useMemo(() => {
    if (!worktree) return undefined;
    return (path: string) =>
      openPane(filePeekPane, { worktree, filePath: path }, { mode: "push" });
  }, [worktree, openPane]);

  const enhancement = useMemo((): MarkdownEnhancement | null => {
    if (!worktree) return null;
    return {
      components: {
        img: ({ src, alt }) => {
          if (typeof src !== "string" || !src) return null;
          const isImage = IMG_HREF_RE.test(src);
          if (isImage) {
            return (
              <ViewerThumbnail
                image={{
                  src: isExternalUrl(src)
                    ? src
                    : `/api/code/${encodeURIComponent(worktree)}/image?path=${encodeURIComponent(src)}`,
                  name: basename(src),
                  sourceLabel: "Markdown",
                  alt: alt || undefined,
                }}
              />
            );
          }
          if (onFileOpen) {
            return (
              <LinkChip
                mono
                onClick={(e) => {
                  e.stopPropagation();
                  onFileOpen(src);
                }}
              >
                {alt || src}
              </LinkChip>
            );
          }
          return null;
        },
      },
    };
  }, [worktree, onFileOpen]);

  const value = useMarkdownEnhancement(enhancement);
  return (
    <MarkdownEnhancementContext.Provider value={value}>
      {children}
    </MarkdownEnhancementContext.Provider>
  );
}
