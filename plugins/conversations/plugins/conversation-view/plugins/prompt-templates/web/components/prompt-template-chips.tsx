import { PenLine } from "lucide-react";
import {
  FloatingAction,
  FloatingActionFadeIn,
} from "@plugins/primitives/plugins/floating-action/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import type { PromptEditorActionProps } from "@plugins/primitives/plugins/prompt-editor/web";
import { Button } from "@/components/ui/button";
import { promptTemplatesResource } from "@plugins/conversations/plugins/conversation-view/plugins/prompt-templates/shared/resources";

export function FloatingTemplateChips({ insertText }: PromptEditorActionProps) {
  const { data: templates } = useResource(promptTemplatesResource);

  if (templates.length === 0) return null;

  return (
    <FloatingAction
      variant="ghost"
      panelClassName="flex-col-reverse items-end gap-1 p-1 group-data-hovered/fa:px-1.5 max-w-7 group-data-hovered/fa:max-w-sm max-h-7 group-data-hovered/fa:max-h-40"
    >
      <PenLine className="size-3.5 shrink-0 text-muted-foreground/40 group-data-hovered/fa:text-muted-foreground transition-colors" />
      <FloatingActionFadeIn className="flex flex-wrap items-center gap-1">
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
      </FloatingActionFadeIn>
    </FloatingAction>
  );
}
