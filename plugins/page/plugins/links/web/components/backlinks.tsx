import { useMemo } from "react";
import { MdLink } from "react-icons/md";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { SectionLabel } from "@plugins/primitives/plugins/css/plugins/text/web";
import {
  DataView,
  defineDataView,
  type FieldDef,
} from "@plugins/primitives/plugins/data-view/web";
import { PageIcon } from "@plugins/page/plugins/editor/web";
import { backlinksResource } from "../../core/resources";
import type { BacklinkRow } from "../../core/schemas";

export interface BacklinksProps {
  /** The target page whose backlinks (referencing pages) to show. */
  documentId: string;
  /** Invoked with a referencing page's id when its row is clicked. */
  onOpenPage?: (pageId: string) => void;
}

const BACKLINKS_VIEW = defineDataView("page.links.backlinks");

// "Linked from" section: lists the pages that link to `documentId` as a
// DataView (search/sort come free). Subscribes to the push-based
// backlinksResource so it updates live as edits reindex. Renders nothing when
// there are no backlinks — so a page without inbound links shows neither the
// section nor the DataView toolbar. No coupling to the pages app or any block
// type — navigation is the injected `onOpenPage`.
export function Backlinks({ documentId, onOpenPage }: BacklinksProps) {
  const result = useResource(backlinksResource, { pageId: documentId });

  const fields = useMemo<FieldDef<BacklinkRow>[]>(
    () => [
      {
        id: "title",
        label: "Title",
        type: "text",
        value: (row) => row.title || "Untitled",
        primary: true,
      },
    ],
    [],
  );

  if (result.pending) return null;
  const rows = result.data;
  if (rows.length === 0) return null;

  return (
    <Stack as="section" gap="xs">
      <SectionLabel>Linked from</SectionLabel>
      <DataView<BacklinkRow>
        rows={rows}
        fields={fields}
        rowKey={(row) => row.id}
        views={["list"]}
        storageKey={BACKLINKS_VIEW}
        onRowActivate={(row) => onOpenPage?.(row.id)}
        viewOptions={{
          list: {
            leading: (row: BacklinkRow) => (
              <Center as="span" className="size-4 text-muted-foreground">
                <PageIcon nodes={row.iconSvgNodes} fallback={MdLink} className="size-4" />
              </Center>
            ),
          },
        }}
      />
    </Stack>
  );
}
