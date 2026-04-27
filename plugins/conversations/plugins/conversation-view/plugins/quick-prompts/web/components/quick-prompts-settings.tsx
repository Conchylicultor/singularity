import { useRef } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { quickPromptsResource } from "../../shared/resources";

async function createPrompt(): Promise<void> {
  const res = await fetch("/api/quick-prompts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "New prompt", prompt: "" }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function updatePrompt(
  id: string,
  patch: { title?: string; prompt?: string },
): Promise<void> {
  const res = await fetch(`/api/quick-prompts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function deletePrompt(id: string): Promise<void> {
  const res = await fetch(`/api/quick-prompts/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export function QuickPromptsSettings() {
  const { data: prompts } = useResource(quickPromptsResource);
  const deletingRef = useRef(new Set<string>());

  if (!prompts) {
    return <p className="text-xs text-muted-foreground">Loading…</p>;
  }

  const visible = prompts.filter((p) => !deletingRef.current.has(p.id));

  function handleDelete(id: string) {
    deletingRef.current.add(id);
    deletePrompt(id).catch(console.error);
  }

  return (
    <div className="flex flex-col gap-3">
      {visible.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No prompts yet. Add one below.
        </p>
      )}
      {visible.map((p) => (
        <div key={p.id} className="flex items-start gap-2">
          <div className="flex flex-1 flex-col gap-1.5">
            <Input
              defaultValue={p.title}
              placeholder="Title"
              className="h-7 text-xs"
              onBlur={(e) =>
                updatePrompt(p.id, { title: e.currentTarget.value }).catch(
                  console.error,
                )
              }
            />
            <textarea
              defaultValue={p.prompt}
              placeholder="Prompt text…"
              className="w-full resize-y rounded-md border border-input bg-background px-3 py-1.5 text-xs min-h-16 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              onBlur={(e) =>
                updatePrompt(p.id, { prompt: e.currentTarget.value }).catch(
                  console.error,
                )
              }
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="mt-0.5 h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
            onClick={() => handleDelete(p.id)}
            aria-label="Delete prompt"
          >
            ×
          </Button>
        </div>
      ))}
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => createPrompt().catch(console.error)}
      >
        Add prompt
      </Button>
    </div>
  );
}
