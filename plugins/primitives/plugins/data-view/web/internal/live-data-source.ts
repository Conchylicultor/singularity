import {
  and,
  filterColumns,
  type Filter,
} from "@plugins/network/plugins/live/plugins/filter/core";
import type {
  LiveScrollCollection,
  LiveWhere,
} from "@plugins/network/plugins/live/core";
import type {
  LiveDataSourceOf,
  LiveSearchableColumn,
  LiveSourceScope,
} from "../../core";

// The constructor of a DataView's live data origin (its types are core's,
// `core/internal/live-data-source.ts`).

/**
 * Declare a live DataView source over a `scroll: true` collection (a
 * collection without it is a tsc error). `searchable` names the text columns
 * the search box matches.
 */
export function liveDataSource<Row, F, S extends string>(
  collection: LiveScrollCollection<Row, F, S>,
  opts: { searchable: readonly LiveSearchableColumn<F>[] },
): LiveDataSourceOf<Row, F> {
  const filterable = collection.filterable as Record<
    string,
    { domain: string } | undefined
  >;
  for (const column of opts.searchable) {
    if (filterable[column]?.domain !== "text") {
      throw new Error(
        `liveDataSource("${collection.key}"): searchable column "${column}" must be a declared text column.`,
      );
    }
  }
  const codec = collection.window.window;
  const erased = collection as unknown as LiveScrollCollection<
    Row,
    unknown,
    string
  >;
  const make = (scope: Filter | undefined): LiveDataSourceOf<Row, F> => ({
    kind: "live",
    collection: erased,
    searchable: opts.searchable,
    scope:
      scope === undefined ? { kind: "all" } : { kind: "where", filter: scope },
    scoped: ({ where }) => {
      // The codec validates the columns and canonicalizes; its strict decode
      // hands the canonical tree back.
      const added = codec.decode(codec.encode({ where })).where;
      const parts = [scope, added].filter((f): f is Filter => f !== undefined);
      return make(
        parts.length === 0
          ? undefined
          : codec.decode(codec.encode({ where: and(...parts) as LiveWhere<F> }))
              .where,
      );
    },
    awaitingScope: (columns) => {
      for (const column of columns) {
        if (filterable[column] === undefined) {
          throw new Error(
            `liveDataSource("${collection.key}").awaitingScope: "${column}" is not a filterable column — a scope constrains filterable columns only.`,
          );
        }
      }
      const awaiting: LiveSourceScope = {
        kind: "awaiting",
        columns: [
          ...columns,
          ...(scope === undefined ? [] : filterColumns(scope)),
        ],
      };
      return {
        kind: "live",
        collection: erased,
        searchable: opts.searchable,
        scope: awaiting,
      };
    },
  });
  return make(undefined);
}
