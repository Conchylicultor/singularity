import { listAttachmentsEndpoint } from "@plugins/infra/plugins/attachments/core";
import { useEndpoint } from "@plugins/infra/plugins/endpoints/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** How many files this task carries; `0` while the list is still loading. */
function useAttachmentCount(taskId: string): number {
  const { data: attachments } = useEndpoint(listAttachmentsEndpoint, {
    ownerType: "tasks",
    id: taskId,
  });
  return attachments?.length ?? 0;
}

/** A task with no attachments ⇒ the host paints no card at all. */
export function useAttachmentsAvailable({ taskId }: { taskId: string }): boolean {
  return useAttachmentCount(taskId) > 0;
}

export function TaskAttachmentsCount({ taskId }: { taskId: string }) {
  const count = useAttachmentCount(taskId);
  return (
    <Text as="span" variant="caption" tone="muted">
      {count}
    </Text>
  );
}

export function TaskAttachments({ taskId }: { taskId: string }) {
  const { data: attachments } = useEndpoint(listAttachmentsEndpoint, {
    ownerType: "tasks",
    id: taskId,
  });

  if (!attachments || attachments.length === 0) return null;

  return (
    <Stack direction="row" wrap gap="md">
      {/* eslint-disable-next-line data-view/no-adhoc-row-list -- mixed inline-image + file-chip section; bespoke layout (DataView candidate tracked in follow-up task) */}
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
              className="h-32 w-auto rounded-md border object-cover"
            />
          </a>
        ) : (
          <Row
            key={a.id}
            href={`/api/attachments/${a.id}`}
            download={a.filename}
            bordered
            hover="muted"
          >
            <span>{a.filename}</span>
            <Text as="span" variant="caption" tone="muted">{formatSize(a.size)}</Text>
          </Row>
        ),
      )}
    </Stack>
  );
}
