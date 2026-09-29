import {
  ResourceErrorInline,
  useResource,
} from "@plugins/primitives/plugins/live-state/web";
import { LinkChip } from "@plugins/primitives/plugins/css/plugins/link-chip/web";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Placeholder } from "@plugins/primitives/plugins/css/plugins/placeholder/web";
import {
  pagesResource,
  pageData,
  type PageRow,
} from "@plugins/page/plugins/editor/core";
import { PageIcon } from "@plugins/page/plugins/editor/web";
import { symbol } from "@plugins/ui/plugins/icons/core";

const linkIcon = symbol("link");

/**
 * Read-only equivalent of the editor's inline page-link chip
 * (`PageLinkInlineView`). Resolves the linked page's title + icon from the live
 * `pagesResource` and renders the same `LinkChip` shape — but never navigates
 * (a static render declares no page navigation), so `onClick` is a pure
 * `stopPropagation`. A consumer that wants navigation can wrap the rendered
 * output in its own click handler; the preview layer stays inert by design.
 *
 * It lives HERE, with the family that declares the token, rather than in
 * `read-only-view` — which used to own it and to name this token type by hand.
 * A read-only surface reaches it through `renderToken` on the registration in
 * `../internal/register`, so the surface names no token family at all and a new
 * one cannot be forgotten there.
 */
export function PageLinkChip({ pageId }: { pageId: string }) {
  const result = useResource(pagesResource);

  // A failed read that once had the page set keeps resolving from it;
  // without one, the chip is the failure (an icon, to keep the line intact).
  let pages: readonly PageRow[];
  switch (result.status) {
    case "loading":
      // Show the raw token-free title placeholder rather than nothing, so the
      // line height stays stable while the resource loads.
      return (
        <LinkChip onClick={(e) => e.stopPropagation()}>
          <Placeholder>…</Placeholder>
        </LinkChip>
      );
    case "error":
      if (result.stale === undefined) {
        return (
          <ResourceErrorInline
            error={result.error}
            refetch={result.refetch}
            variant="icon"
            icon={linkIcon}
            subject="the linked page"
          />
        );
      }
      pages = result.stale;
      break;
    case "ready":
      pages = result.data;
  }

  const target = pages.find((d) => d.id === pageId);
  const data = target ? pageData(target) : undefined;

  if (!target) {
    return (
      <LinkChip onClick={(e) => e.stopPropagation()}>
        <Placeholder>(page not found)</Placeholder>
      </LinkChip>
    );
  }

  return (
    <LinkChip
      leading={
        <Center as="span" className="size-3.5">
          <PageIcon
            icon={data?.icon}
            fallback={linkIcon}
            className="size-3.5"
          />
        </Center>
      }
      onClick={(e) => e.stopPropagation()}
    >
      {data?.title || "Untitled"}
    </LinkChip>
  );
}
