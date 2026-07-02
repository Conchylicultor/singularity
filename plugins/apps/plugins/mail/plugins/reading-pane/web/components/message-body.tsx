import { useState } from "react";
import { MdImage } from "react-icons/md";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Cluster } from "@plugins/primitives/plugins/css/plugins/cluster/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { MailHtml } from "@plugins/apps/plugins/mail/plugins/mail-html/web";
import { AttachmentChip } from "@plugins/apps/plugins/mail/plugins/attachments/web";
import type { MailAttachment } from "@plugins/apps/plugins/mail/plugins/mail-core/core";
import { useHydratedMessage } from "../internal/use-hydrated-message";
import { useResolveCid } from "../internal/use-resolve-cid";

// Renders a message body. Mounted only when its card is expanded (the collapsible
// unmounts its content when closed), so the hydrate query fires on first open.
export function MessageBody({ messageId }: { messageId: string }) {
  const query = useHydratedMessage(messageId, true);

  if (query.isPending) return <Loading variant="text" />;
  if (query.isError) {
    return <Placeholder tone="error">Couldn’t load this message.</Placeholder>;
  }

  return (
    <RenderedBody
      html={query.data.message.bodyHtml}
      text={query.data.message.bodyText}
      attachments={query.data.attachments}
    />
  );
}

function RenderedBody({
  html,
  text,
  attachments,
}: {
  html: string | null;
  text: string | null;
  attachments: MailAttachment[];
}) {
  const [showRemoteImages, setShowRemoteImages] = useState(false);
  const [remoteDetected, setRemoteDetected] = useState(false);
  const resolveCid = useResolveCid(attachments);

  // Non-inline attachments get chips below the body; inline ones are the cid:
  // images resolved into the HTML.
  const fileAttachments = attachments.filter((a) => !a.inline);

  return (
    <Stack gap="sm">
      {remoteDetected && !showRemoteImages ? (
        <Row
          bordered
          icon={<MdImage className="icon-auto" />}
          actionsAlwaysVisible
          actions={
            <Button
              variant="outline"
              onClick={() => {
                setShowRemoteImages(true);
              }}
            >
              Display images
            </Button>
          }
        >
          <Text variant="caption" tone="muted">
            Images are hidden to protect your privacy.
          </Text>
        </Row>
      ) : null}

      {html ? (
        <MailHtml
          html={html}
          showRemoteImages={showRemoteImages}
          onRemoteImagesDetected={setRemoteDetected}
          resolveCid={resolveCid}
        />
      ) : text ? (
        <Text
          as="pre"
          variant="body"
          className="whitespace-pre-wrap break-words font-sans"
        >
          {text}
        </Text>
      ) : (
        <Placeholder tone="muted">This message has no content.</Placeholder>
      )}

      {fileAttachments.length > 0 ? (
        <Cluster>
          {fileAttachments.map((att) => (
            <AttachmentChip key={att.id} attachment={att} />
          ))}
        </Cluster>
      ) : null}
    </Stack>
  );
}
