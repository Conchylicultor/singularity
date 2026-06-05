import { useRef } from "react";
import { MdFileUpload } from "react-icons/md";
import { cn } from "@/lib/utils";

/**
 * The Library toolbar's Import control: a button that opens a hidden file
 * picker constrained to `.mid`/`.midi`, handing the chosen file to `onPick`.
 * The input value is reset after each selection so re-picking the same file
 * fires `onChange` again. Disabled while an import is in flight.
 */
export function ImportButton({
  importing,
  onPick,
}: {
  importing: boolean;
  onPick: (file: File) => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        type="button"
        disabled={importing}
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium",
          "text-foreground transition-colors hover:bg-muted/50",
          "disabled:cursor-not-allowed disabled:opacity-60",
        )}
      >
        <MdFileUpload className="size-4" />
        {importing ? "Importing…" : "Import"}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".mid,.midi"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          // Reset so re-selecting the same file fires onChange again.
          e.target.value = "";
          if (file) onPick(file);
        }}
      />
    </>
  );
}
