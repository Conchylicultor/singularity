/**
 * MIDI file dropzone.
 *
 * Accepts .mid / .midi files via drag-and-drop or a file-input click.
 * Reads the file as an ArrayBuffer and calls `onRaw(arrayBuffer)`.
 * Errors are surfaced visibly — never swallowed.
 */

import { useCallback, useRef, useState } from "react";
import { MdMusicNote, MdUploadFile } from "react-icons/md";
import { cn } from "@/lib/utils";

interface Props {
  onRaw: (raw: unknown) => void;
}

export function MidiLoader({ onRaw }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const readFile = useCallback(
    (file: File) => {
      if (!file.name.match(/\.midi?$/i)) {
        setError(`Not a MIDI file: ${file.name}`);
        return;
      }
      setError(null);
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result;
        if (!(result instanceof ArrayBuffer)) {
          throw new Error("[midi source] FileReader did not return ArrayBuffer");
        }
        onRaw(result);
      };
      reader.onerror = () => {
        throw new Error(`[midi source] Failed to read file: ${file.name}`);
      };
      reader.readAsArrayBuffer(file);
    },
    [onRaw],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) readFile(file);
    },
    [readFile],
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) readFile(file);
      // Reset so the same file can be re-selected.
      e.target.value = "";
    },
    [readFile],
  );

  return (
    <div className="flex flex-col items-center gap-3 p-4">
      <div
        role="button"
        tabIndex={0}
        aria-label="Drop a MIDI file or click to browse"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={cn(
          "flex w-full max-w-sm cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 transition-colors",
          dragging
            ? "border-primary bg-primary/5"
            : "border-border hover:border-muted-foreground/50 hover:bg-muted/30",
        )}
      >
        <MdUploadFile className="size-10 text-muted-foreground" />
        <div className="text-center">
          <p className="text-sm font-medium">
            {fileName ?? "Drop a MIDI file here"}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            .mid / .midi — or click to browse
          </p>
        </div>
        {fileName ? (
          <div className="flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-xs text-muted-foreground">
            <MdMusicNote className="size-3.5 shrink-0" />
            <span className="truncate max-w-[16rem]">{fileName}</span>
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept=".mid,.midi,audio/midi,audio/x-midi"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}
