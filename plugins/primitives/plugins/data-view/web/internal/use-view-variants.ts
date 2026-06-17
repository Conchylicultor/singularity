import { useMemo } from "react";
import type { VariantEntry } from "@plugins/fields/plugins/variant/plugins/config/core";
import { DataViewSlots } from "../slots";

/**
 * View-type → variant registry bridge. Maps every registered `DataViewSlots.View`
 * contribution to a `VariantEntry` keyed by its `type`, so a web-side
 * `variantField({ useVariants })` can render a type selector plus each type's
 * `configSchema` sub-fields in the settings popover.
 *
 * Generic — it iterates contributions and **never names a view child** (collection-
 * consumer separation). A view-type with no `configSchema` contributes an empty
 * `fields: {}` (type selector only, no options sub-form).
 */
export function useViewVariants(): Map<string, VariantEntry> {
  const contributions = DataViewSlots.View.useContributions();
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
