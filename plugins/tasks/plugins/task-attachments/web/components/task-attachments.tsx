import { useEffect, useState } from "react";
import { listAttachments, type Attachment } from "@plugins/infra/plugins/attachments/web";

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function TaskAttachments({ taskId }: { taskId: string }) {
  const [attachments, setAttachments] = useState<Attachment[] | null>(null);

  useEffect(() => {
    listAttachments("task", taskId).then(setAttachments).catch(console.error);
  }, [taskId]);

  if (!attachments || attachments.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <span className="text-muted-foreground text-xs uppercase tracking-wide">
        Attachments
      </span>
      <div className="flex flex-wrap gap-3">
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
            <a
              key={a.id}
              href={`/api/attachments/${a.id}`}
              download={a.filename}
              className="hover:bg-muted flex items-center gap-2 rounded border px-3 py-2 text-sm"
            >
              <span>{a.filename}</span>
              <span className="text-muted-foreground text-xs">{formatSize(a.size)}</span>
            </a>
          ),
        )}
      </div>
    </div>
  );
}
