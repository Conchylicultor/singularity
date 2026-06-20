import { MdLink } from "react-icons/md";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { SectionLabel } from "@plugins/primitives/plugins/css/plugins/text/web";
import { PageIcon } from "@plugins/page/plugins/editor/web";
import { backlinksResource } from "../../core/resources";

export interface BacklinksProps {
  /** The target page whose backlinks (referencing pages) to show. */
  documentId: string;
  /** Invoked with a referencing page's id when its row is clicked. */
  onOpenPage?: (pageId: string) => void;
}

// Pure "Linked from" section: lists the pages that link to `documentId`.
// Subscribes to the push-based backlinksResource so it updates live as edits
// reindex. Renders nothing when there are no backlinks. No coupling to the
// pages app or any block type — navigation is the injected `onOpenPage`.
export function Backlinks({ documentId, onOpenPage }: BacklinksProps) {
  const result = useResource(backlinksResource, { pageId: documentId });
  if (result.pending) return null;
  const rows = result.data;
  if (rows.length === 0) return null;

  return (
    <Stack as="section" gap="xs">
      <SectionLabel>Linked from</SectionLabel>
      <Stack as="ul" gap="2xs">
        {rows.map((row) => (
          <li key={row.id}>
            <Row
              hover="muted"
              onClick={() => onOpenPage?.(row.id)}
              icon={
                <Center as="span" className="size-4 text-muted-foreground">
                  <PageIcon nodes={row.iconSvgNodes} fallback={MdLink} className="size-4" />
                </Center>
              }
            >
              <span className="truncate">{row.title || "Untitled"}</span>
            </Row>
          </li>
        ))}
      </Stack>
    </Stack>
  );
}
