import { Fragment, type ReactNode } from "react";
import { parseFileLinks } from "./parse";

export interface FileLinkTextProps {
  text: string;
  onFileOpen?: (path: string, line?: number) => void;
}

export function FileLinkText({ text, onFileOpen }: FileLinkTextProps): ReactNode {
  if (!text) return null;
  const segments = parseFileLinks(text);
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.type === "url") {
          return (
            <a
              key={i}
              href={seg.value}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary underline"
              onClick={(e) => e.stopPropagation()}
            >
              {seg.value}
            </a>
          );
        }
        if (seg.type !== "path") return <Fragment key={i}>{seg.value}</Fragment>;
        if (onFileOpen) {
          return (
            <button
              key={i}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onFileOpen(seg.value, seg.line);
              }}
              className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-info cursor-pointer hover:underline"
            >
              {seg.line != null ? `${seg.value}:${seg.line}` : seg.value}
            </button>
          );
        }
        return (
          <span
            key={i}
            className="rounded bg-muted px-1 py-0.5 font-mono text-xs"
          >
            {seg.value}
          </span>
        );
      })}
    </>
  );
}
