import type { ReactNode } from "react";
import {
  SearchInput,
  useTextFilter,
} from "@plugins/primitives/plugins/search/web";
import { Row } from "@plugins/primitives/plugins/css/plugins/row/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { Text } from "@plugins/primitives/plugins/css/plugins/text/web";
import type { FieldDef } from "../../../core";
import { useResolveFieldIcon } from "../../internal/use-field-icon";

/**
 * Notion-style search-first field picker: a "Filter by…" typeahead over the
 * schema's filterable fields, each rendered as an icon + label `Row`. Selecting a
 * field reports its id to `onPick` in a single click. The shared building block
 * behind every "choose a field" surface in the filter builder — the empty state,
 * the `Add filter` affordance, and changing an existing rule's field — so they
 * all gain typeahead from one place.
 */
export function FieldSearchList<TRow>(props: {
  fields: FieldDef<TRow>[];
  onPick: (fieldId: string) => void;
  /** Search input placeholder. Defaults to "Filter by…" (the filter-builder copy). */
  placeholder?: string;
  /** Optional advanced affordance rendered below the list (e.g. "Add filter group"). */
  footer?: ReactNode;
}): ReactNode {
  const resolveIcon = useResolveFieldIcon();
  const { query, setQuery, filtered } = useTextFilter({
    items: props.fields,
    accessor: (f) => f.label,
  });

  return (
    <Stack gap="xs">
      <SearchInput
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={props.placeholder ?? "Filter by…"}
        aria-label="Search fields"
      />
      <Stack gap="2xs" className="max-h-64 overflow-y-auto">
        {filtered.length === 0 ? (
          <Text as="div" variant="caption" tone="muted" className="px-2xs py-xs">
            No fields
          </Text>
        ) : (
          filtered.map((field) => {
            const Icon = resolveIcon(field.type ?? "text");
            return (
              <Row
                key={field.id}
                size="sm"
                hover="muted"
                icon={Icon ? <Icon /> : undefined}
                onClick={() => props.onPick(field.id)}
              >
                <span className="truncate">{field.label}</span>
              </Row>
            );
          })
        )}
      </Stack>
      {props.footer}
    </Stack>
  );
}
