import { useState } from "react";
import { useLive } from "@plugins/network/plugins/live/web";
import { foldResource } from "@plugins/primitives/plugins/live-state/web";
import { useCollapsible } from "@plugins/primitives/plugins/collapsible/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Button } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Backlinks } from "@plugins/page/plugins/links/web";
import {
  pageBacklinks,
  type BacklinkRow,
} from "@plugins/page/plugins/links/core";
import { PageIcon } from "@plugins/page/plugins/editor/web";
import { symbol } from "@plugins/ui/plugins/icons/core";
import { Icon } from "@plugins/ui/plugins/icons/web";
import type { PageHeaderPartProps } from "../slots";

const chevronIcon = symbol("chevron-right");
const linkIcon = symbol("link");

/** How many linking pages' icons the toggle stacks. */
const FACES = 3;

/**
 * "Linked from N pages", under the page title (`PageDetail.UnderTitle`): a
 * quiet toggle showing the first few linking pages' icons, which expands IN
 * PLACE into the full backlinks list — each row the source page, where it sits,
 * and the sentence that links here.
 *
 * Navigation is not passed down: the list renders inside the pane's own
 * `PageNavigationProvider`, the same seam the page's reference blocks read, so
 * a backlink row and a sub-page row open a page the same way by construction.
 *
 * Open state is local to the open page — it starts closed on every page, and
 * following a backlink to another page does not carry it along.
 */
export function BacklinksUnderTitle({ pageId }: PageHeaderPartProps) {
  const result = useLive(pageBacklinks, { pageId });
  const [openFor, setOpenFor] = useState<string | null>(null);
  const { open, triggerControlProps, contentId, chevronClassName } =
    useCollapsible({
      open: openFor === pageId,
      onOpenChange: (next) => setOpenFor(next ? pageId : null),
    });

  // Gated by `useHasBacklinks`, so this mounts only once the list is known
  // (non-empty) or failed. A failure keeps what it last knew; with nothing
  // known the toggle names no count and its expanded body renders the failure.
  const rows = foldResource(result, {
    loading: () => undefined,
    error: (_error, stale) => stale ?? null,
    ready: (data) => data,
  });
  if (rows === undefined) return null;
  const n = rows?.length ?? 0;

  return (
    <Stack gap="2xs">
      <Inline gap="none">
        <Button
          variant="ghost"
          className="text-muted-foreground"
          {...triggerControlProps}
        >
          {rows !== null && n > 0 && <Faces rows={rows.slice(0, FACES)} />}
          {n > 0
            ? `Linked from ${n} ${n === 1 ? "page" : "pages"}`
            : "Linked from"}
          <Icon icon={chevronIcon} className={chevronClassName} />
        </Button>
      </Inline>
      {open && (
        <div id={contentId} role="region" aria-label="Pages linking here">
          <Backlinks documentId={pageId} />
        </div>
      )}
    </Stack>
  );
}

/** The first linking pages' icons, overlapping like a stack of faces. */
function Faces({ rows }: { rows: BacklinkRow[] }) {
  return (
    <Inline gap="none" aria-hidden>
      {rows.map((row, i) => (
        <Center
          key={row.id}
          as="span"
          className="size-5 rounded-sm border border-background bg-muted"
          // One overlap the spacing ramp does not model (a negative step): each
          // face tucks under the one before it.
          style={i > 0 ? { marginLeft: "-0.25rem" } : undefined}
        >
          <PageIcon icon={row.icon} fallback={linkIcon} className="size-3.5" />
        </Center>
      ))}
    </Inline>
  );
}

/**
 * The contribution's `useAvailable` gate: a page with no inbound links shows
 * nothing under its title. While the value is still pending nothing is painted
 * either — no row is the one answer that claims nothing about the page, and it
 * appears once the backlinks settle non-empty. A failed read DOES paint the
 * toggle: its expanded body renders the failure with Retry.
 */
export function useHasBacklinks({ pageId }: PageHeaderPartProps): boolean {
  const result = useLive(pageBacklinks, { pageId });
  return foldResource(result, {
    loading: () => false,
    error: () => true,
    ready: (links) => links.length > 0,
  });
}
