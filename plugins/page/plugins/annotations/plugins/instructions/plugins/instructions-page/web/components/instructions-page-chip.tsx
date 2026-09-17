import { MdPublic } from "react-icons/md";
import { Badge } from "@plugins/primitives/plugins/css/plugins/badge/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import {
  pageData,
  pageKindOf,
  pagesResource,
} from "@plugins/page/plugins/editor/core";
import type { PageReferenceChipProps } from "@plugins/page/plugins/page-reference/web";

/**
 * The chip at the right edge of an instructions page's row: `Global` when the
 * page is handed to every conversation at its start, nothing otherwise — the row's
 * tint already says "instructions", and the reach is the one fact it cannot.
 *
 * The chip is handed only the page's id, so it reads the page's kind off the
 * live pages list (the same list the sidebar renders from). While that list is
 * still loading it waits as a chip-sized shimmer rather than claiming "not
 * global".
 */
export function InstructionsPageChip({ pageId }: PageReferenceChipProps) {
  const result = useResource(pagesResource);
  if (result.pending) return <Loading variant="block" className="h-5 w-16" />;
  const page = result.data.find((p) => p.id === pageId);
  if (!page) return null;
  const kind = pageKindOf(pageData(page));
  if (kind.kind !== "instructions" || !kind.global) return null;
  return (
    <Badge
      variant="primary"
      icon={<MdPublic />}
      title="Handed to every agent conversation at its start"
    >
      Global
    </Badge>
  );
}
