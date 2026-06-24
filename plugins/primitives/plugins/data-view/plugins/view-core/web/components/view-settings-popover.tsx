import { type ReactNode, useMemo } from "react";
import { MdContentCopy, MdDelete } from "react-icons/md";
import { Button, Input } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { Stack } from "@plugins/primitives/plugins/css/plugins/spacing/web";
import { SectionLabel } from "@plugins/primitives/plugins/css/plugins/text/web";
import { variantField } from "@plugins/fields/plugins/variant/plugins/config/core";
import type { VariantEntry } from "@plugins/fields/plugins/variant/plugins/config/core";
import { FieldRenderer } from "@plugins/config_v2/plugins/fields/web";
import type { VariantValue } from "@plugins/fields/plugins/variant/core";
import type { ViewTypeMeta } from "../../core";
import type { ResolvedViewInstance } from "../internal/resolve-instances";
import type { ViewActionsCore } from "../internal/use-view-model";

/**
 * Settings panel for the active instance — opened by clicking the active chip.
 * Renders: a name input, the type-dispatched options sub-form (over a web-side
 * `variantField`), and Duplicate / Delete actions.
 *
 * The `viewField` is built **web-side at render** with the injected `useVariants`
 * registry, so the type selector + each type's `configSchema` sub-fields recurse
 * through `FieldRenderer`. The stored descriptor stays server-safe (no
 * `useVariants`). `updateView(id, v, { merge: true })` shallow-merges over the
 * raw view, preserving any host-injected keys (sort/filter) the sub-form omits.
 */
export function ViewSettingsPopover<T extends ViewTypeMeta>({
  instance,
  actions,
  viewVariants,
  onClose,
}: {
  instance: ResolvedViewInstance<T>;
  actions: ViewActionsCore;
  viewVariants: Map<string, VariantEntry>;
  onClose: () => void;
}): ReactNode {
  const id = instance.instance.id;

  const viewField = useMemo(
    () => variantField({ label: "View", useVariants: () => viewVariants }),
    [viewVariants],
  );

  // The stored variant value `{ type, ...options }`. Resolved instance carries it
  // as the opaque `options` (set by buildInstanceFromRow). Fall back to a bare
  // `{ type }` for a synthesized (not-yet-materialized) default.
  const view = (instance.instance.options as VariantValue | undefined) ?? {
    type: instance.instance.type,
  };

  return (
    <Stack gap="md">
      <Stack gap="2xs">
        <SectionLabel>Name</SectionLabel>
        <Input
          defaultValue={instance.instance.name}
          onBlur={(e) => {
            const next = e.target.value.trim();
            if (next && next !== instance.instance.name)
              actions.renameView(id, next);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
        />
      </Stack>

      <FieldRenderer
        field={viewField}
        value={view}
        onChange={(v) => actions.updateView(id, v as VariantValue, { merge: true })}
      />

      <Stack direction="row" gap="xs">
        <Button
          variant="outline"
          onClick={() => {
            actions.duplicateView(id);
            onClose();
          }}
        >
          <MdContentCopy />
          Duplicate
        </Button>
        <Button
          variant="ghost"
          className="text-destructive"
          onClick={() => {
            actions.deleteView(id);
            onClose();
          }}
        >
          <MdDelete />
          Delete
        </Button>
      </Stack>
    </Stack>
  );
}
