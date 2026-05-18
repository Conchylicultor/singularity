import { useRef } from "react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { ShellCommands } from "@plugins/shell/web";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { reviewSectionsResource } from "../../shared";

function toastError(title: string, err: unknown) {
  ShellCommands.Toast({
    title,
    description: err instanceof Error ? err.message : String(err),
    variant: "error",
  });
}

async function createSection(): Promise<void> {
  const res = await fetch("/api/review-sections", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "New section", patterns: [] }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function updateSection(
  id: string,
  patch: { name?: string; patterns?: string[] },
): Promise<void> {
  const res = await fetch(`/api/review-sections/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function deleteSection(id: string): Promise<void> {
  const res = await fetch(`/api/review-sections/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export function ReviewSectionsSettings() {
  const sectionsResult = useResource(reviewSectionsResource);
  const deletingRef = useRef(new Set<string>());
  if (sectionsResult.pending) return null;
  const sections = sectionsResult.data;

  const visible = sections.filter((s) => !deletingRef.current.has(s.id));

  function handleDelete(id: string) {
    deletingRef.current.add(id);
    deleteSection(id).catch((err: unknown) =>
      toastError("Failed to delete section", err),
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">
        Files matching a section&apos;s patterns are grouped under that section
        in the review pane. Unmatched files appear in a default
        &ldquo;Changes&rdquo; group. Patterns use prefix matching by default;
        prefix with <code className="rounded bg-muted px-1">**/</code> for
        suffix matching.
      </p>
      {visible.length === 0 && (
        <p className="text-xs text-muted-foreground">
          No sections yet. Add one below.
        </p>
      )}
      {visible.map((s) => (
        <SectionRow
          key={s.id}
          id={s.id}
          name={s.name}
          patterns={s.patterns}
          onDelete={() => handleDelete(s.id)}
        />
      ))}
      <Button
        variant="outline"
        size="sm"
        className="self-start"
        onClick={() =>
          createSection().catch((err: unknown) =>
            toastError("Failed to create section", err),
          )
        }
      >
        Add section
      </Button>
    </div>
  );
}

function SectionRow({
  id,
  name,
  patterns,
  onDelete,
}: {
  id: string;
  name: string;
  patterns: string[];
  onDelete: () => void;
}) {
  const lastPatternsRef = useRef(patterns.join("\n"));

  return (
    <div className="flex items-start gap-2 rounded-md border border-border p-3">
      <div className="flex flex-1 flex-col gap-1.5">
        <Input
          defaultValue={name}
          placeholder="Section name"
          className="h-7 text-xs font-medium"
          onBlur={(e) =>
            updateSection(id, { name: e.currentTarget.value }).catch(
              (err: unknown) => toastError("Failed to save name", err),
            )
          }
        />
        <textarea
          defaultValue={patterns.join("\n")}
          placeholder="One pattern per line (e.g. docs/ or **/CLAUDE.md)"
          rows={3}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onBlur={(e) => {
            const value = e.currentTarget.value;
            if (value === lastPatternsRef.current) return;
            lastPatternsRef.current = value;
            const parsed = value
              .split("\n")
              .map((l) => l.trim())
              .filter(Boolean);
            updateSection(id, { patterns: parsed }).catch((err: unknown) =>
              toastError("Failed to save patterns", err),
            );
          }}
        />
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="mt-0.5 h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onDelete}
        aria-label="Delete section"
      >
        ×
      </Button>
    </div>
  );
}
