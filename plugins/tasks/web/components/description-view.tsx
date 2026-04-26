import { useRef, useState } from "react";
import { MdEdit } from "react-icons/md";
import { Button } from "@/components/ui/button";

// Matches relative file paths with at least one directory separator, e.g.
// research/2026-04-26-foo.md, docs/plugins.md, src/app/page.tsx
const FILE_PATH_RE =
  /\b((?:[\w.\-]+\/)+[\w.\-]+\.(?:md|mdx|ts|tsx|js|jsx|py|go|yaml|yml|json|txt))\b/g;

interface Segment {
  type: "text" | "path";
  value: string;
}

function parseDescription(text: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  FILE_PATH_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FILE_PATH_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }
    segments.push({ type: "path", value: match[1] ?? "" });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ type: "text", value: text.slice(lastIndex) });
  }
  return segments;
}

export function DescriptionView({
  value,
  onChange,
  onFileOpen,
}: {
  value: string;
  onChange: (v: string) => void;
  onFileOpen?: (path: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  if (editing) {
    return (
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => setEditing(false)}
        autoFocus
        placeholder="Add a description…"
        rows={10}
        className="placeholder:text-muted-foreground min-h-48 w-full resize-y rounded border bg-transparent p-3 text-sm outline-none focus:ring-1 focus:ring-ring"
      />
    );
  }

  const segments = value ? parseDescription(value) : [];

  return (
    <div
      className="group relative min-h-48 w-full cursor-text rounded border p-3 text-sm"
      onClick={() => setEditing(true)}
    >
      {value ? (
        <p className="whitespace-pre-wrap break-words">
          {segments.map((seg, i) =>
            seg.type === "path" && onFileOpen ? (
              <button
                key={i}
                type="button"
                onClick={(e) => { e.stopPropagation(); onFileOpen(seg.value); }}
                className="rounded bg-muted px-1 py-0.5 font-mono text-xs text-primary hover:underline"
              >
                {seg.value}
              </button>
            ) : (
              <span key={i} className={seg.type === "path" ? "rounded bg-muted px-1 py-0.5 font-mono text-xs" : undefined}>
                {seg.value}
              </span>
            ),
          )}
        </p>
      ) : (
        <span className="text-muted-foreground">Add a description…</span>
      )}
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-1 top-1 size-6 opacity-0 group-hover:opacity-100 transition-opacity"
        title="Edit description"
        onClick={() => setEditing(true)}
      >
        <MdEdit className="size-3.5" />
      </Button>
    </div>
  );
}
