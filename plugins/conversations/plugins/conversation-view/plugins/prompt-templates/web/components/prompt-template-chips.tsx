import { useState } from "react";
import { PenLine } from "lucide-react";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import type { PromptEditorActionProps } from "@plugins/primitives/plugins/prompt-editor/web";
import { Button } from "@/components/ui/button";
import { promptTemplatesResource } from "../../shared/resources";

export function FloatingTemplateChips({ insertText }: PromptEditorActionProps) {
  const [open, setOpen] = useState(false);
  const { data: templates } = useResource(promptTemplatesResource);

  if (templates.length === 0) return null;

  return (
    <div
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {open ? (
        <div className="flex flex-wrap items-center gap-1 rounded-md bg-background/90 px-1.5 py-1 shadow-sm border border-border backdrop-blur-sm">
          {templates.map((t) => (
            <Button
              key={t.id}
              variant="outline"
              size="sm"
              className="h-6 rounded-full border-dashed px-2.5 text-xs"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertText(t.prompt)}
            >
              <PenLine className="mr-1 size-3" />
              {t.title}
            </Button>
          ))}
        </div>
      ) : (
        <button
          type="button"
          className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground/40 hover:text-muted-foreground transition-colors"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          aria-label="Prompt templates"
        >
          <PenLine className="size-3.5" />
        </button>
      )}
    </div>
  );
}
