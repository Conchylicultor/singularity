import { useMemo } from "react";
import type { VariantEntry } from "@plugins/fields/plugins/variant/plugins/config/core";
import type { ViewTypeMeta } from "../../core";

/**
 * View-type → variant registry bridge. Maps every supplied view-type
 * contribution to a `VariantEntry` keyed by its `type`, so a web-side
 * `variantField({ useVariants })` can render a type selector plus each type's
 * `configSchema` sub-fields in the settings popover.
 *
 * Generic — it iterates the supplied contributions and **never names a view
 * child** (collection-consumer separation). The caller passes the live
 * contributions (e.g. from `DataViewSlots.View.useContributions()`). A view-type
 * with no `configSchema` contributes an empty `fields: {}` (type selector only,
 * no options sub-form).
 */
export function useViewVariants<T extends ViewTypeMeta>(
  contributions: T[],
): Map<string, VariantEntry> {
  return useMemo(
    () =>
      new Map<string, VariantEntry>(
        contributions.map((c) => [
          c.type,
          { label: c.title, fields: c.configSchema ?? {} },
        ]),
      ),
    [contributions],
  );
}
