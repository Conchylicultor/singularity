import { useRef, useState } from "react";
import { MdEdit } from "react-icons/md";
import { Button } from "@/components/ui/button";
import { FileLinkText } from "@plugins/primitives/plugins/file-links/web";

export function DescriptionView({
  value,
  onChange,
  onFocus,
  onBlur,
  onFileOpen,
}: {
  value: string;
  onChange: (v: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
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
        onFocus={onFocus}
        onBlur={() => {
          setEditing(false);
          onBlur?.();
        }}
        autoFocus
        placeholder="Add a description…"
        rows={10}
        className="placeholder:text-muted-foreground min-h-48 w-full resize-y rounded border bg-transparent p-3 text-sm outline-none focus:ring-1 focus:ring-ring"
      />
    );
  }

  return (
    <div
      className="group relative min-h-48 w-full cursor-text rounded border p-3 text-sm"
      onClick={() => setEditing(true)}
    >
      {value ? (
        <p className="whitespace-pre-wrap break-words">
          <FileLinkText text={value} onFileOpen={onFileOpen} />
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
