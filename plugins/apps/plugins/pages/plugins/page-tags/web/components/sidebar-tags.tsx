import { useMemo } from "react";
import type {
  FieldDef,
  FieldExtensionProps,
} from "@plugins/primitives/plugins/data-view/web";
import { Inline } from "@plugins/primitives/plugins/css/plugins/inline/web";
import { foldResource } from "@plugins/primitives/plugins/live-state/web";
import type { PageRow } from "@plugins/page/plugins/editor/core";
import { TagDot, usePageTagIndex } from "@plugins/page/plugins/tags/web";

const NO_TAGS: readonly string[] = [];

/** Dots a row shows at most; a page with more still lists them all on hover. */
const MAX_DOTS = 3;

/**
 * The `tags` field of the Pages sidebar DataView (`PageTree.Fields`): each
 * page's tag ids, in its order, presented by the vocabulary's names — so a
 * view can filter on a tag ("has any of In progress") or group by it, with no
 * code in the sidebar. A filter dimension, not body text: the sidebar's views
 * list only `title` in their visible fields, so it draws no chips on a row
 * (the row marker below is the sidebar's at-a-glance mark).
 *
 * The values come from a read of their own, so while it loads the field says
 * so (`pending`) rather than projecting every page as untagged, and a failed
 * read with nothing held is the field's `readError`.
 */
export function TagsField({ render }: FieldExtensionProps<PageRow>) {
  const index = usePageTagIndex();
  const fields = useMemo<FieldDef<PageRow>[]>(() => {
    const held = foldResource(index, {
      loading: () => null,
      error: (_error, stale) => stale ?? null,
      ready: (map) => map,
    });
    return [
      {
        id: "tags",
        label: "Tags",
        type: "tags",
        values: (b) => held?.get(b.id)?.map((t) => t.id) ?? [...NO_TAGS],
        // While nothing is held the field is `pending` (below), which every
        // reader of its options renders as loading.
        options: held === null ? [] : optionsOf(held),
        filterable: true,
        visible: false,
        ...(held === null && index.status === "loading"
          ? { pending: true }
          : {}),
        ...(held === null && index.status === "error"
          ? { readError: { error: index.error, refetch: index.refetch } }
          : {}),
      },
    ];
  }, [index]);
  return <>{render(fields)}</>;
}

/** Every tag some page carries, as the field's options (id → name). */
function optionsOf(map: ReadonlyMap<string, { id: string; name: string }[]>) {
  const byId = new Map<string, string>();
  for (const tags of map.values()) for (const t of tags) byId.set(t.id, t.name);
  return [...byId].map(([value, label]) => ({ value, label }));
}

/**
 * The sidebar row's mark (`PageTree.RowMarker`): one small dot per tag in the
 * tag's hue, the names on hover. Nothing for an untagged page — and nothing
 * while the tags load: a missing dot claims nothing, it appears once known.
 */
export function TagDotsMarker({ page }: { page: PageRow }) {
  const tags = foldResource(usePageTagIndex(), {
    loading: () => undefined,
    error: (_error, stale) => stale?.get(page.id),
    ready: (map) => map.get(page.id),
  });
  if (tags === undefined || tags.length === 0) return null;
  return (
    <Inline gap="2xs" title={tags.map((t) => t.name).join(", ")}>
      {tags.slice(0, MAX_DOTS).map((t) => (
        <TagDot key={t.id} color={t.color} className="size-1.5" />
      ))}
    </Inline>
  );
}
