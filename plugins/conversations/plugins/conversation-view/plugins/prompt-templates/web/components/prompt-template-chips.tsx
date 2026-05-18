import { useMemo } from "react";
import { PenLine } from "lucide-react";
import {
  FloatingAction,
  FloatingActionFadeIn,
} from "@plugins/primitives/plugins/floating-action/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import type { PromptEditorActionProps } from "@plugins/primitives/plugins/prompt-editor/web";
import { Button } from "@/components/ui/button";
import { promptTemplatesResource } from "../../shared/resources";
import type { PromptTemplate } from "../../shared/resources";

const MAX_PINNED = 3;

function applyTemplate(
  t: PromptTemplate,
  insertText: (text: string) => void,
) {
  insertText(t.prompt);
  void fetch(`/api/prompt-templates/${t.id}/use`, { method: "POST" });
}

function TemplateChip({
  template,
  insertText,
  pinned,
}: {
  template: PromptTemplate;
  insertText: (text: string) => void;
  pinned?: boolean;
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      className={
        pinned
          ? "h-6 rounded-full px-2.5 text-xs"
          : "h-6 rounded-full border-dashed px-2.5 text-xs"
      }
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => applyTemplate(template, insertText)}
    >
      <PenLine className="mr-1 size-3" />
      {template.title}
    </Button>
  );
}

export function FloatingTemplateChips({ insertText }: PromptEditorActionProps) {
  const templatesResult = useResource(promptTemplatesResource);

  const pinnedTemplates = useMemo(
    () =>
      templatesResult.pending ? [] :
      [...templatesResult.data]
        .filter((t) => t.useCount > 0)
        .sort((a, b) => b.useCount - a.useCount)
        .slice(0, MAX_PINNED),
    [templatesResult],
  );

  if (templatesResult.pending) return null;
  const templates = templatesResult.data;
  if (templates.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5">
      {pinnedTemplates.length > 0 && (
        <div className="flex items-center gap-1">
          {pinnedTemplates.map((t) => (
            <TemplateChip
              key={t.id}
              template={t}
              insertText={insertText}
              pinned
            />
          ))}
        </div>
      )}
      <FloatingAction
        variant="ghost"
        panelClassName="flex-col-reverse items-end gap-1 p-1 group-data-hovered/fa:px-1.5 max-w-7 group-data-hovered/fa:max-w-sm max-h-7 group-data-hovered/fa:max-h-40"
      >
        <PenLine className="size-3.5 shrink-0 text-muted-foreground/40 group-data-hovered/fa:text-muted-foreground transition-colors" />
        <FloatingActionFadeIn className="flex flex-wrap items-center gap-1">
          {templates.map((t) => (
            <TemplateChip
              key={t.id}
              template={t}
              insertText={insertText}
            />
          ))}
        </FloatingActionFadeIn>
      </FloatingAction>
    </div>
  );
}
