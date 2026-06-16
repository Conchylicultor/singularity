import { type ReactNode } from "react";
import { MdAdd } from "react-icons/md";
import { Button, cn } from "@plugins/primitives/plugins/ui-kit/web";
import { Text } from "@plugins/primitives/plugins/text/web";
import { Stack } from "@plugins/primitives/plugins/spacing/web";
import { Loading } from "@plugins/primitives/plugins/loading/web";
import {
  pickPrimaryField,
  useFlatRows,
  useResolveOperatorSet,
  type CreateOption,
  type DataViewRenderProps,
  type FieldDef,
  type ItemActionsDescriptor,
} from "@plugins/primitives/plugins/data-view/web";
import type { CoverContent, GalleryViewOptions } from "../../core";
import { DataCard } from "./data-card";

/**
 * Pick the cover field: explicit `coverField` id wins, else the field marked
 * `cover: true`, else the first `media` field. Undefined → no media region.
 */
function pickCoverField<TRow>(
  fields: FieldDef<TRow>[],
  coverField: string | undefined,
): FieldDef<TRow> | undefined {
  if (coverField) {
    return fields.find((f) => f.id === coverField);
  }
  return (
    fields.find((f) => f.cover === true) ??
    fields.find((f) => f.type === "media")
  );
}

function renderFieldContent<TRow>(
  field: FieldDef<TRow>,
  row: TRow,
): ReactNode {
  if (field.cell) return field.cell(row);
  return String(field.value?.(row) ?? "");
}

/** Paint a structured cover descriptor into a uniform `aspect-video` frame. */
function renderCover(cover: CoverContent): ReactNode {
  switch (cover.kind) {
    case "image":
      return (
        <img
          src={cover.src}
          alt=""
          className="aspect-video w-full rounded-md object-cover"
        />
      );
    case "icon":
      return (
        <div className="flex aspect-video w-full items-center justify-center rounded-md bg-primary/10 text-primary">
          {cover.icon}
        </div>
      );
    case "node":
      return (
        <div className="aspect-video w-full overflow-hidden rounded-md border border-border bg-muted/40">
          {cover.node}
        </div>
      );
  }
}

function renderMedia<TRow>(
  options: GalleryViewOptions<TRow>,
  coverFieldDef: FieldDef<TRow> | undefined,
  row: TRow,
): ReactNode {
  // The structured cover producer wins — the sanctioned icon/node/image path.
  if (options.cover) {
    const cover = options.cover(row);
    return cover ? renderCover(cover) : null;
  }
  // Else fall back to the field-driven image cover.
  if (!coverFieldDef) return null;
  const raw = coverFieldDef.value?.(row);
  if (typeof raw === "string" && raw.length > 0) {
    return renderCover({ kind: "image", src: raw });
  }
  // Non-URL media (or custom cell) falls back to the field's renderer.
  return coverFieldDef.cell ? <div>{coverFieldDef.cell(row)}</div> : null;
}

/**
 * Gallery view: a responsive card grid. Renders the consumer's custom card via
 * `options.renderCard` (the custom card owns its own click handling), or a
 * field-driven default `<DataCard>` wired to `onRowActivate`.
 *
 * The host passes RAW rows; this view applies its own search/filter/sort via the
 * shared `useFlatRows` hook. `rows`/`fields` arrive type-erased as `unknown`;
 * this is the documented re-cast boundary for the view child.
 */
export function GalleryView(props: DataViewRenderProps<unknown>): ReactNode {
  const resolveOperatorSet = useResolveOperatorSet();
  const rows = useFlatRows(
    props.rows,
    props.fields,
    props.state,
    resolveOperatorSet,
    props.searchAccessor,
  );
  const fields = props.fields;
  const options = (props.options ?? {}) as GalleryViewOptions<unknown>;
  // Documented cast boundary: itemActions arrives type-erased.
  const itemActions = props.itemActions as
    | ItemActionsDescriptor<unknown>
    | undefined;

  // Loading wins over empty: emptyState requires confirmed-empty.
  if (props.loading) {
    return <>{props.loadingState ?? <Loading variant="cards" count={8} />}</>;
  }

  // Documented cast boundary: creators arrives type-erased via render props.
  const creators = props.creators as CreateOption[] | undefined;

  if (rows.length === 0) {
    return (
      <Stack
        align="center"
        justify="center"
        gap="md"
        className={cn(props.embedded ? "py-xl" : "h-full p-xl")}
      >
        <Text as="div" variant="body" className="text-muted-foreground">
          {props.emptyState}
        </Text>
        {creators?.length ? (
          <Stack align="center" gap="sm">
            {creators.map((c) => (
              <Button key={c.id} size="sm" onClick={() => void c.onSelect()}>
                {c.icon}
                {c.label}
              </Button>
            ))}
          </Stack>
        ) : null}
      </Stack>
    );
  }

  const coverField = pickCoverField(fields, options.coverField);
  const titleField = pickPrimaryField(fields);

  return (
    <div
      className={cn("grid gap-lg", !props.embedded && "p-xl")}
      style={{
        gridTemplateColumns: `repeat(auto-fill, minmax(${options.minCardWidth ?? 200}px, 1fr))`,
      }}
    >
      {rows.map((row, i) => {
        const key = props.rowKey(row, i);

        if (options.renderCard) {
          // Custom card owns click + actions; never wrapped or re-wired here.
          return <div key={key}>{options.renderCard(row)}</div>;
        }

        const media = renderMedia(options, coverField, row);
        const bodyFields = fields.filter(
          (f) => f.id !== titleField?.id && f.id !== coverField?.id,
        );

        return (
          <DataCard
            key={key}
            selected={key === props.selectedRowId}
            onActivate={() => props.onRowActivate?.(row)}
            media={media}
            actions={
              itemActions ? (
                <itemActions.Row
                  row={row}
                  hasChildren={props.hasChildren?.(props.rowKey(row, i)) ?? false}
                />
              ) : undefined
            }
          >
            {titleField ? (
              <Text
                as="div"
                variant="label"
                className="truncate font-semibold text-foreground"
              >
                {renderFieldContent(titleField, row)}
              </Text>
            ) : null}
            {bodyFields.length > 0 ? (
              // eslint-disable-next-line spacing/no-adhoc-spacing -- top offset separating the body block from the card title
              <div className="mt-1 flex flex-col gap-2xs">
                {bodyFields.map((field) => (
                  <Text
                    as="div"
                    key={field.id}
                    variant="caption"
                    className="truncate text-muted-foreground"
                  >
                    {renderFieldContent(field, row)}
                  </Text>
                ))}
              </div>
            ) : null}
          </DataCard>
        );
      })}
      {/* Trailing "+" card: single-creator only. Multiple creators → omitted (a
          single dashed card can't express an N-way choice; they get the toolbar
          menu instead). */}
      {options.showCreateCard && creators?.length === 1 ? (
        <button
          type="button"
          onClick={() => void creators[0]!.onSelect()}
          className="focus-ring flex aspect-video flex-col items-center justify-center gap-xs rounded-lg border border-dashed border-border text-muted-foreground transition-colors hover:border-primary hover:bg-muted/40 hover:text-foreground"
        >
          <MdAdd className="size-5" />
          <Text variant="label">{creators[0]!.label}</Text>
        </button>
      ) : null}
    </div>
  );
}
