import { useRef, useState } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { PromptEditor } from "@plugins/primitives/plugins/paste-images/web";
import { ShellCommands } from "@plugins/shell/web";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { launchPromptsResource } from "../../internal/resources";
import type { LaunchPrompt } from "../../internal/resources";

function toastError(title: string, err: unknown) {
  ShellCommands.Toast({
    title,
    description: err instanceof Error ? err.message : String(err),
    variant: "error",
  });
}

async function createPrompt(): Promise<void> {
  const res = await fetch("/api/launch-prompts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "New prompt", prompt: "", model: "sonnet" }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function updatePrompt(
  id: string,
  patch: { title?: string; prompt?: string; model?: string },
): Promise<void> {
  const res = await fetch(`/api/launch-prompts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function deletePrompt(id: string): Promise<void> {
  const res = await fetch(`/api/launch-prompts/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export function LaunchPromptsSettings() {
  const { data: prompts } = useResource(launchPromptsResource);
  const deletingRef = useRef(new Set<string>());

  const visible = prompts.filter((p) => !deletingRef.current.has(p.id));

  function handleDelete(id: string) {
    deletingRef.current.add(id);
    deletePrompt(id).catch((err: unknown) => toastError("Failed to delete prompt", err));
  }

  return (
    <div className="flex flex-col gap-3">
      {visible.length === 0 && (
        <p className="text-muted-foreground text-xs">
          No prompts yet. Add one below.
        </p>
      )}
      {visible.map((p) => (
        <PromptRow
          key={p.id}
          id={p.id}
          title={p.title}
          prompt={p.prompt}
          model={p.model}
          onDelete={() => handleDelete(p.id)}
        />
      ))}
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => createPrompt().catch((err: unknown) => toastError("Failed to create prompt", err))}
      >
        Add prompt
      </Button>
    </div>
  );
}

function PromptRow({
  id,
  title,
  prompt,
  model,
  onDelete,
}: {
  id: string;
  title: string;
  prompt: string;
  model: LaunchPrompt["model"];
  onDelete: () => void;
}) {
  const [body, setBody] = useState(prompt);
  const lastSavedRef = useRef(prompt);

  return (
    <div className="flex items-start gap-2">
      <div className="flex flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <Input
            defaultValue={title}
            placeholder="Title"
            className="h-7 text-xs"
            onBlur={(e) =>
              updatePrompt(id, { title: e.currentTarget.value }).catch(
                (err: unknown) => toastError("Failed to save title", err),
              )
            }
          />
          <ModelToggle
            model={model}
            onChange={(m) => updatePrompt(id, { model: m }).catch((err: unknown) => toastError("Failed to save model", err))}
          />
        </div>
        <div
          onBlur={(e) => {
            if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
            if (body === lastSavedRef.current) return;
            lastSavedRef.current = body;
            updatePrompt(id, { prompt: body }).catch((err: unknown) => toastError("Failed to save prompt", err));
          }}
        >
          <PromptEditor
            value={body}
            onChange={setBody}
            placeholder="Prompt text…"
            minRows={3}
            namespace={`launch-prompt-${id}`}
          />
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-destructive mt-0.5 h-7 w-7 shrink-0"
        onClick={onDelete}
        aria-label="Delete prompt"
      >
        ×
      </Button>
    </div>
  );
}

function ModelToggle({
  model,
  onChange,
}: {
  model: LaunchPrompt["model"];
  onChange: (model: LaunchPrompt["model"]) => void;
}) {
  return (
    <div className="flex shrink-0 overflow-hidden rounded-md border text-xs">
      {(["sonnet", "opus"] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => { if (model !== m) onChange(m); }}
          className={`px-2 py-1 capitalize transition-colors ${
            model === m
              ? "bg-secondary text-secondary-foreground"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  );
}
