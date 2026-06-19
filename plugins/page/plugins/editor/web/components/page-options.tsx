import { useMemo } from "react";
import { MdAddCircleOutline } from "react-icons/md";
import { Center } from "@plugins/primitives/plugins/css/plugins/center/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import { useResource } from "@plugins/primitives/plugins/live-state/web";
import { pagesResource, pageData, type Block } from "../../core";
import { PageIcon } from "./page-icon";

/** One row in a page picker: an existing page, or a "create new page" affordance. */
export type PageOption =
  | { kind: "page"; page: Block }
  | { kind: "create"; title: string };

export type PageOptionsResult =
  | { pending: true; options?: undefined }
  | { pending: false; options: PageOption[] };

/**
 * Ordered picker options for a query: pages whose title matches, followed by an
 * optional "Create '<query>'" row when `allowCreate` and the query is non-empty.
 * Backed by the live `pagesResource`, so the full list is always in memory and
 * filtering is local. Shared by the page-link block picker and the inline `[[`
 * typeahead so both surfaces stay identical.
 *
 * Returns a discriminated union so consumers can render a distinct loading state
 * instead of a premature "No pages found" while the resource is still pending.
 */
export function usePageOptions(
  query: string,
  opts?: { allowCreate?: boolean },
): PageOptionsResult {
  const resourceResult = useResource(pagesResource);
  const allowCreate = opts?.allowCreate ?? false;
  const options = useMemo(() => {
    if (resourceResult.pending) return null;
    const pages = resourceResult.data;
    const q = query.trim().toLowerCase();
    const matched = q
      ? pages.filter((d) => (pageData(d).title || "Untitled").toLowerCase().includes(q))
      : pages;
    const items: PageOption[] = matched.map((page) => ({ kind: "page", page }));
    if (allowCreate && query.trim()) {
      items.push({ kind: "create", title: query.trim() });
    }
    return items;
  }, [resourceResult, query, allowCreate]);
  if (resourceResult.pending) return { pending: true };
  return { pending: false, options: options! };
}

function PageOptionIcon({ page }: { page: Block }) {
  return (
    <Center as="span" className="size-4 text-muted-foreground">
      <PageIcon nodes={pageData(page).iconSvgNodes} className="size-4" />
    </Center>
  );
}

/**
 * Presentational list of page-picker options with an active-row highlight.
 * Mirrors `BlockTypeList`: item rows use `onMouseDown` + `preventDefault` so a
 * click never blurs an editor the consumer relies on keeping focused.
 */
export function PageOptionsList({
  options,
  activeIndex,
  onSelect,
  onCreate,
  onHoverIndex,
}: {
  options: PageOption[];
  activeIndex: number;
  onSelect: (pageId: string) => void;
  onCreate?: (title: string) => void;
  onHoverIndex?: (index: number) => void;
}) {
  if (options.length === 0) {
    return (
      <Text as="div" variant="body" className="text-muted-foreground px-sm py-xs">
        No pages found
      </Text>
    );
  }
  return (
    <Stack gap="none">
      {options.map((option, i) =>
        option.kind === "page" ? (
          <Row
            key={option.page.id}
            selected={i === activeIndex}
            icon={<PageOptionIcon page={option.page} />}
            onMouseEnter={() => onHoverIndex?.(i)}
            onMouseDown={(e: React.MouseEvent) => {
              e.preventDefault();
              onSelect(option.page.id);
            }}
          >
            <span className="truncate">{pageData(option.page).title || "Untitled"}</span>
          </Row>
        ) : (
          <Row
            key="__create__"
            selected={i === activeIndex}
            icon={<MdAddCircleOutline className="text-muted-foreground" />}
            onMouseEnter={() => onHoverIndex?.(i)}
            onMouseDown={(e: React.MouseEvent) => {
              e.preventDefault();
              onCreate?.(option.title);
            }}
          >
            <span className="truncate">
              Create <span className="font-medium">“{option.title}”</span>
            </span>
          </Row>
        ),
      )}
    </Stack>
  );
}
