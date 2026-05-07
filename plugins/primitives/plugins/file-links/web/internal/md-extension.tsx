import type { ReactNode } from "react";
import type { Components } from "react-markdown";
import type { CodeHandler } from "@plugins/primitives/plugins/markdown/web";
import { useFileOpen } from "./file-open-context";
import { linkifyChildren } from "./linkify-children";
import { parseFileLinks } from "./parse";

export function useFileLinksTransform(): ((children: ReactNode) => ReactNode) | null {
  const onFileOpen = useFileOpen() ?? undefined;
  return (children) => linkifyChildren(children, onFileOpen);
}

export function useFileLinksCodeHandler(): CodeHandler | null {
  const onFileOpen = useFileOpen();
  return {
    inline: (text) => {
      if (text.startsWith("http://") || text.startsWith("https://")) {
        return (
          <a
            className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-primary underline hover:opacity-80"
            href={text}
            target="_blank"
            rel="noopener noreferrer"
          >
            {text}
          </a>
        );
      }
      if (onFileOpen) {
        const segments = parseFileLinks(text);
        if (segments.length === 1 && segments[0]?.type === "path") {
          const seg = segments[0];
          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onFileOpen(seg.value, seg.line);
              }}
              className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-primary dark:text-blue-400 cursor-pointer hover:underline"
            >
              {seg.line != null ? `${seg.value}:${seg.line}` : seg.value}
            </button>
          );
        }
      }
      return null;
    },
  };
}

export function useFileLinksComponents(): Partial<Components> {
  const onFileOpen = useFileOpen();
  if (!onFileOpen) return {};
  return {
    a: ({ href, children, ...p }) => {
      if (href && !href.startsWith("http") && !href.startsWith("#")) {
        const segments = parseFileLinks(href);
        if (segments.length === 1 && segments[0]?.type === "path") {
          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onFileOpen(href);
              }}
              className="text-primary underline cursor-pointer"
            >
              {children}
            </button>
          );
        }
      }
      return (
        <a
          className="text-primary underline"
          href={href}
          target={href?.startsWith("http") ? "_blank" : undefined}
          rel={href?.startsWith("http") ? "noopener noreferrer" : undefined}
          {...p}
        >
          {children}
        </a>
      );
    },
  };
}
