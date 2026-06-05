import { type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type {
  DataViewRenderProps,
  FieldDef,
} from "@plugins/primitives/plugins/data-view/web";
import type { GalleryViewOptions } from "../../core";
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

/** The title field: first `text` field, else the first field. */
function pickTitleField<TRow>(
  fields: FieldDef<TRow>[],
): FieldDef<TRow> | undefined {
  return fields.find((f) => f.type === "text") ?? fields[0];
}

function renderFieldContent<TRow>(
  field: FieldDef<TRow>,
  row: TRow,
): ReactNode {
  if (field.cell) return field.cell(row);
  return String(field.value?.(row) ?? "");
}

function renderMedia<TRow>(
  field: FieldDef<TRow> | undefined,
  row: TRow,
): ReactNode {
  if (!field) return null;
  const raw = field.value?.(row);
  if (typeof raw === "string" && raw.length > 0) {
    return (
      <img
        src={raw}
        alt={field.label}
        className="aspect-video w-full rounded-md object-cover"
      />
    );
  }
  // Non-URL media (or custom cell) falls back to the field's renderer.
  return field.cell ? <div>{field.cell(row)}</div> : null;
}

/**
 * Gallery view: a responsive card grid. Renders the consumer's custom card via
 * `options.renderCard` (the custom card owns its own click handling), or a
 * field-driven default `<DataCard>` wired to `onRowActivate`.
 *
 * `rows`/`fields` arrive type-erased as `unknown`; this is the documented
 * re-cast boundary for the view child.
 */
export function GalleryView(props: DataViewRenderProps<unknown>): ReactNode {
  const rows = props.rows;
  const fields = props.fields;
  const options = (props.options ?? {}) as GalleryViewOptions<unknown>;

  if (rows.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
        {props.emptyState}
      </div>
    );
  }

  const coverField = pickCoverField(fields, options.coverField);
  const titleField = pickTitleField(fields);

  return (
    <div
      className="grid gap-4 p-6"
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

        const media = renderMedia(coverField, row);
        const bodyFields = fields.filter(
          (f) => f.id !== titleField?.id && f.id !== coverField?.id,
        );

        return (
          <DataCard
            key={key}
            onActivate={() => props.onRowActivate?.(row)}
            media={media}
          >
            {titleField ? (
              <div className="truncate text-sm font-semibold text-foreground">
                {renderFieldContent(titleField, row)}
              </div>
            ) : null}
            {bodyFields.length > 0 ? (
              <div className="mt-1 flex flex-col gap-0.5">
                {bodyFields.map((field) => (
                  <div
                    key={field.id}
                    className={cn("truncate text-xs text-muted-foreground")}
                  >
                    {renderFieldContent(field, row)}
                  </div>
                ))}
              </div>
            ) : null}
          </DataCard>
        );
      })}
    </div>
  );
}
