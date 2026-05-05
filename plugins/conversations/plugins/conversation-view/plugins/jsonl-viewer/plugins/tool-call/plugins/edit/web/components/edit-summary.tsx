import type { ToolRendererProps } from "@plugins/conversations/plugins/conversation-view/plugins/jsonl-viewer/plugins/tool-call/shared";

export function EditSummary({ event }: ToolRendererProps) {
  const fp = (event.input as { file_path?: string })?.file_path;
  if (!fp) return null;
  return (
    <span className="max-w-[40ch] truncate font-mono text-[11px] text-muted-foreground">
      {fp}
    </span>
  );
}
