import { useRef, useState } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { PromptEditor } from "@plugins/primitives/plugins/paste-images/web";
import { ShellCommands } from "@plugins/shell/web";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { promptTemplatesResource } from "../../shared/resources";

function toastError(title: string, err: unknown) {
  ShellCommands.Toast({
    title,
    description: err instanceof Error ? err.message : String(err),
    variant: "error",
  });
}

async function createTemplate(): Promise<void> {
  const res = await fetch("/api/prompt-templates", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "New template", prompt: "" }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function updateTemplate(
  id: string,
  patch: { title?: string; prompt?: string },
): Promise<void> {
  const res = await fetch(`/api/prompt-templates/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function deleteTemplate(id: string): Promise<void> {
  const res = await fetch(`/api/prompt-templates/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export function PromptTemplatesSettings() {
  const { data: templates } = useResource(promptTemplatesResource);
  const deletingRef = useRef(new Set<string>());

  if (!templates) {
    return <p className="text-muted-foreground text-xs">Loading...</p>;
  }

  const visible = templates.filter((t) => !deletingRef.current.has(t.id));

  function handleDelete(id: string) {
    deletingRef.current.add(id);
    deleteTemplate(id).catch((err: unknown) => toastError("Failed to delete template", err));
  }

  return (
    <div className="flex flex-col gap-3">
      {visible.length === 0 && (
        <p className="text-muted-foreground text-xs">
          No templates yet. Add one below.
        </p>
      )}
      {visible.map((t) => (
        <TemplateRow
          key={t.id}
          id={t.id}
          title={t.title}
          prompt={t.prompt}
          onDelete={() => handleDelete(t.id)}
        />
      ))}
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() => createTemplate().catch((err: unknown) => toastError("Failed to create template", err))}
      >
        Add template
      </Button>
    </div>
  );
}

function TemplateRow({
  id,
  title,
  prompt,
  onDelete,
}: {
  id: string;
  title: string;
  prompt: string;
  onDelete: () => void;
}) {
  const [body, setBody] = useState(prompt);
  const lastSavedRef = useRef(prompt);

  return (
    <div className="flex items-start gap-2">
      <div className="flex flex-1 flex-col gap-1.5">
        <Input
          defaultValue={title}
          placeholder="Title"
          className="h-7 text-xs"
          onBlur={(e) =>
            updateTemplate(id, { title: e.currentTarget.value }).catch(
              (err: unknown) => toastError("Failed to save title", err),
            )
          }
        />
        <div
          onBlur={(e) => {
            if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
            if (body === lastSavedRef.current) return;
            lastSavedRef.current = body;
            updateTemplate(id, { prompt: body }).catch((err: unknown) => toastError("Failed to save prompt", err));
          }}
        >
          <PromptEditor
            value={body}
            onChange={setBody}
            placeholder="Template text..."
            minRows={3}
            namespace={`prompt-template-${id}`}
          />
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground hover:text-destructive mt-0.5 h-7 w-7 shrink-0"
        onClick={onDelete}
        aria-label="Delete template"
      >
        ×
      </Button>
    </div>
  );
}
