import { useMemo } from "react";
import { MdLink } from "react-icons/md";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import {
  DataView,
  defineDataView,
  type FieldDef,
} from "@plugins/primitives/plugins/data-view/web";
import { PageIcon } from "@plugins/page/plugins/editor/web";
import { usePageNavigation } from "@plugins/page/plugins/page-reference/web";
import { backlinksResource } from "../../core/resources";
import type { BacklinkRow } from "../../core/schemas";

export interface BacklinksProps {
  /** The target page whose backlinks (referencing pages) to show. */
  documentId: string;
}

const BACKLINKS_VIEW = defineDataView("page.links.backlinks");

// Lists the pages that link to `documentId` as a DataView (search/sort come
// free). Subscribes to the push-based backlinksResource so it updates live as
// edits reindex. Renders nothing when there are no backlinks — so a page without
// inbound links shows no DataView toolbar either. Title-less on purpose: this is
// a body, and whatever hosts it (the Pages page-detail section, whose host paints
// the "Linked from" card) owns the heading. No coupling to the pages app or any
// block type — navigation is whatever the surrounding host declared through
// `page-reference`, the same seam the reference blocks inside a page read.
export function Backlinks({ documentId }: BacklinksProps) {
  const nav = usePageNavigation();
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
    <DataView<BacklinkRow>
      rows={rows}
      fields={fields}
      rowKey={(row) => row.id}
      views={["list"]}
      storageKey={BACKLINKS_VIEW}
      onRowActivate={(row) => nav?.open(row.id)}
      viewOptions={{
        list: {
          leading: (row: BacklinkRow) => (
            <Center as="span" className="size-4 text-muted-foreground">
              <PageIcon
                nodes={row.iconSvgNodes}
                fallback={MdLink}
                className="size-4"
              />
            </Center>
          ),
        },
      }}
    />
  );
}
