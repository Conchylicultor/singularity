import { MdLink } from "react-icons/md";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { SectionLabel } from "@plugins/primitives/plugins/section-label/web";
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
    <section className="flex flex-col gap-1.5">
      <SectionLabel>Linked from</SectionLabel>
      <ul className="flex flex-col gap-0.5">
        {rows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => onOpenPage?.(row.id)}
              className="flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm hover:bg-muted"
            >
              <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
                {row.icon ?? <MdLink className="size-4" />}
              </span>
              <span className="truncate">{row.title || "Untitled"}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
