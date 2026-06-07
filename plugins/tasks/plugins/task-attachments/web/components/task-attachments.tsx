import { useEffect, useState } from "react";
import { listAttachments, type Attachment } from "@plugins/infra/plugins/attachments/web";
import { toast } from "@plugins/notifications/web";
import {
  Collapsible,
  CollapsibleContent,
} from "@plugins/primitives/plugins/collapsible/web";
import { Row, SectionHeaderRow } from "@plugins/primitives/plugins/row/web";

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TaskAttachments({ taskId }: { taskId: string }) {
  const [attachments, setAttachments] = useState<Attachment[] | null>(null);

  useEffect(() => {
    listAttachments("task", taskId).then(setAttachments).catch((err: unknown) => {
      toast({
        type: "task",
        title: "Failed to load attachments",
        description: err instanceof Error ? err.message : String(err),
        variant: "error",
      });
    });
  }, [taskId]);

  if (!attachments || attachments.length === 0) return null;

  return (
    <Collapsible defaultOpen className="flex flex-col gap-2">
      <SectionHeaderRow variant="eyebrow">Attachments</SectionHeaderRow>
      <CollapsibleContent className="flex flex-wrap gap-3">
        {attachments.map((a) =>
          a.mime.startsWith("image/") ? (
            <a
              key={a.id}
              href={`/api/attachments/${a.id}`}
              target="_blank"
              rel="noreferrer"
              className="block"
              title={a.filename}
            >
              <img
                src={`/api/attachments/${a.id}`}
                alt={a.filename}
                className="h-32 w-auto rounded border object-cover"
              />
            </a>
          ) : (
            <Row
              key={a.id}
              as="a"
              href={`/api/attachments/${a.id}`}
              download={a.filename}
              bordered
              hover="muted"
            >
              <span>{a.filename}</span>
              <span className="text-muted-foreground text-xs">{formatSize(a.size)}</span>
            </Row>
          ),
        )}
      </CollapsibleContent>
    </Collapsible>
  );
}
