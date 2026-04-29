import { useRef, useState } from "react";
import { LaunchButtons, type LaunchRequest } from "@plugins/primitives/plugins/launch/web";
import { PromptEditor } from "@plugins/primitives/plugins/paste-images/web";

export function PromptForm({ id, getBlob }: { id: string; getBlob: () => Blob | null | Promise<Blob | null> }) {
  const [text, setText] = useState("");
  const textRef = useRef(text);
  textRef.current = text;

  // The screenshot blob is uploaded via the existing `/api/screenshots/:id/file`
  // path (returns a server-side disk path) and appended to the prompt as
  // `@<path>`. Pasted images live inside the markdown as
  // `![](/api/attachments/<id>)` refs — the conversations server resolves
  // those into `@<path>` before handing the prompt to the agent.
  const getRequest = async (): Promise<LaunchRequest> => {
    const body = textRef.current.trim();
    const blob = await getBlob();
    if (!blob) return { prompt: body || undefined };
    const res = await fetch(`/api/screenshots/${id}/file`, {
      method: "POST",
      body: blob,
      headers: { "content-type": "image/png" },
    });
    if (!res.ok) return { prompt: body || undefined };
    const { path } = (await res.json()) as { path: string };
    const prompt = body ? `${body}\n\n@${path}` : `@${path}`;
    return { prompt };
  };

  return (
    <div className="bg-background flex shrink-0 flex-col gap-2 border-t p-3">
      <PromptEditor
        value={text}
        onChange={setText}
        placeholder="Describe what to do with this screenshot…"
        minRows={3}
        maxHeight="12rem"
        namespace="screenshot-prompt"
      />
      <LaunchButtons size="sm" getRequest={getRequest} />
    </div>
  );
}
