import type { ComponentType } from "react";
import type { FieldsRecord } from "@plugins/fields/core";
import type { VariantValue } from "@plugins/fields/plugins/variant/core";

/**
 * The type-agnostic metadata every view-type carries. A consumer of the engine
 * (e.g. data-view) extends this with its own render-contract field (the
 * `component`). The engine only ever reads these five fields — it never knows
 * about `FieldDef`/rows/sort/filter.
 */
export interface ViewTypeMeta {
  /** Registry id of this view-type (e.g. "table", "gallery"). Instances
   *  reference it via `ViewInstance.type`. */
  type: string;
  title: string;
  icon: ComponentType<{ className?: string }>;
  order?: number;
  /** This view requires the host's hierarchy; the host drops it when absent. */
  hierarchical?: boolean;
  /** Per-instance `options` sub-form schema, type-dispatched by `type`. Drives
   *  the settings popover's options sub-form (via a web-side `variantField`). */
  configSchema?: FieldsRecord;
}

/**
 * A named instance of a registered view-type. The host renders view-instances —
 * a named, individually-configured *use* of a view-type, carrying
 * `{ id, name, type, options }`. In the un-materialized default case the engine
 * synthesizes one default instance per resolved view-type (id === type,
 * name === title); otherwise the instance list is config-authored.
 */
export interface ViewInstance {
  /** Instance identity — the localStorage active-id + switcher selection key.
   *  Default-instances set this equal to the view-type `type`. */
  id: string;
  /** Switcher display label. Default-instances use the view-type `title`. */
  name: string;
  /** Registry id (`ViewTypeMeta.type`) this instance renders. */
  type: string;
  /** Opaque per-instance options forwarded to the view-type component. */
  options?: unknown;
}

/**
 * One config row of `viewsDescriptor.views`: the `listField` auto-injects `id`;
 * order is the array position (no `rank`). `name` is the switcher label; `view`
 * is the `variantField` value `{ type, ...options }` where `type` selects the
 * view-type and the rest is that type's saved options (including host-injected
 * keys such as `sort`/`filter`).
 */
export interface ViewConfigRow {
  id: string;
  name: string;
  view: VariantValue;
}

/** A view-type the add-menu offers (capability-gated). */
export interface AddableViewType {
  type: string;
  title: string;
  icon: ComponentType<{ className?: string }>;
}
