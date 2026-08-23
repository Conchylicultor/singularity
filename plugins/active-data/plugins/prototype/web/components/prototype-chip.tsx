import { MdDashboardCustomize } from "react-icons/md";
import {
  useResource,
  matchResource,
} from "@plugins/primitives/plugins/live-state/web";
import { useOpenPane } from "@plugins/primitives/plugins/pane/web";
import { LinkChip } from "@plugins/primitives/plugins/css/plugins/link-chip/web";
import { prototypesResource } from "@plugins/apps/plugins/prototypes/plugins/files/core";
import { prototypeDetailPane } from "@plugins/apps/plugins/prototypes/plugins/gallery/web";

/**
 * A raw `proto-…` id rendered as a chip that opens the mock beside the text.
 *
 * Resolution is free: `prototypesResource` is a live, app-wide list re-broadcast
 * on every file change under the prototypes dir, so a transcript full of ids
 * costs no requests and the labels track a rename of the `<title>` live.
 *
 * Every arm that is not a resolved prototype — still loading, failed to load,
 * or no such folder — renders the raw id as plain text, unstyled. That is
 * `page-link`'s behaviour rather than `attempt`'s, and with an opaque id it is
 * the only honest one: there is nothing to show about `proto-1786877040-w2vi`
 * except its title, so a chip that opens nothing would be strictly worse than
 * the text the model wrote.
 */
export function PrototypeChip({
  content,
}: {
  content: string;
  attrs: Record<string, string>;
}) {
  const id = content.trim();
  const openPane = useOpenPane();
  const result = useResource(prototypesResource);

  // The id exactly as written. Not a degraded chip and not a loading glyph:
  // this is spliced into a sentence, so anything else moves the prose around
  // as the resource settles.
  const raw = <>{id}</>;

  return matchResource(result, {
    pending: () => raw,
    // Explicit, unlike page-link: matchResource's default error arm is a block
    // `<Placeholder tone="error">`, which is a reasonable default for a pane
    // body and quite wrong dropped into the middle of a paragraph.
    error: () => raw,
    ready: (prototypes) => {
      const meta = prototypes.find((p) => p.name === id);
      if (meta === undefined) return raw;

      return (
        <LinkChip
          onClick={(e) => {
            e.stopPropagation();
            // `push` opens the mock as a column to the RIGHT of the surface
            // holding the text, so the conversation stays beside it:
            // `/agents/c/<convId>/proto/proto-…`. The pane's own
            // `defaultAncestors` (the gallery) are not stacked — a push is
            // relative to the caller, not a fresh route.
            openPane(prototypeDetailPane, { name: id }, { mode: "push" });
          }}
          title={`${meta.title} · ${id}`}
          leading={<MdDashboardCustomize />}
        >
          {meta.title}
        </LinkChip>
      );
    },
  });
}
