import { Fragment, type ReactNode } from "react";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { LinkChip } from "@plugins/primitives/plugins/css/plugins/link-chip/web";
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
            <LinkChip
              key={i}
              mono
              onClick={(e) => {
                e.stopPropagation();
                onFileOpen(seg.value, seg.line);
              }}
              className="text-info"
            >
              {seg.line != null ? `${seg.value}:${seg.line}` : seg.value}
            </LinkChip>
          );
        }
        return (
          <Badge key={i} variant="muted" size="sm" className="font-mono">
            {seg.value}
          </Badge>
        );
      })}
    </>
  );
}
