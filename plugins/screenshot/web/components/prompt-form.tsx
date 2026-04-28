import { useRef, useState } from "react";
import { LaunchButtons, type LaunchRequest } from "@plugins/primitives/plugins/launch/web";
import { cn } from "@/lib/utils";

export function PromptForm({ id, getBlob }: { id: string; getBlob: () => Blob | null | Promise<Blob | null> }) {
  const [text, setText] = useState("");
  const textRef = useRef(text);
  textRef.current = text;

  const getRequest = async (): Promise<LaunchRequest> => {
    const blob = await getBlob();
    if (!blob) return { prompt: textRef.current.trim() || undefined };
    const res = await fetch(`/api/screenshots/${id}/file`, {
      method: "POST",
      body: blob,
      headers: { "content-type": "image/png" },
    });
    if (!res.ok) return { prompt: textRef.current.trim() || undefined };
    const { path } = (await res.json()) as { path: string };
    const body = textRef.current.trim();
    const prompt = body ? `${body}\n\n@${path}` : `@${path}`;
    return { prompt };
  };

  return (
    <div className="flex shrink-0 flex-col gap-2 border-t bg-background p-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Describe what to do with this screenshot…"
        rows={3}
        className={cn(
          "min-h-20 w-full resize-none rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-sm outline-none transition-colors",
          "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          "dark:bg-input/30",
        )}
      />
      <LaunchButtons size="sm" getRequest={getRequest} />
    </div>
  );
}
