import { defineConfig } from "@plugins/config_v2/core";
import type { ConfigDescriptor, FieldDef } from "@plugins/config_v2/core";
import { dynamicEnumField } from "@plugins/fields/plugins/dynamic-enum/plugins/config/core";

/** The config fields shape every variant region shares: a single dynamic-enum. */
export type VariantRegionFields = { variant: FieldDef<string> };

export interface VariantRegionCore<Props> {
  /** Stable region id — drives the config name, slot id, and VariantGroup id. */
  readonly id: string;
  /** Human label — used for the picker section and field label. */
  readonly label: string;
  /** Variant id rendered until the user picks another (and for unforked apps). */
  readonly defaultVariant: string;
  /** `"app"` opts the descriptor into the per-app fork mechanism; omit for global. */
  readonly scope?: "app";
  /** The config descriptor (a single dynamic-enum `variant` field). */
  readonly config: ConfigDescriptor<VariantRegionFields>;
  /**
   * The canonical frozen `variant` field reference. `DynamicEnum.Options`
   * matches by reference equality, so this MUST be the exact object stored on
   * `config.fields.variant`.
   */
  readonly variantField: FieldDef<string>;
  /** Phantom to thread `Props` through to the web/server factories. */
  readonly _props?: Props;
}

export function defineVariantRegion<Props>(opts: {
  id: string;
  label: string;
  defaultVariant: string;
  scope?: "app";
}): VariantRegionCore<Props> {
  const config: ConfigDescriptor<VariantRegionFields> = defineConfig({
    name: opts.id,
    fields: {
      variant: dynamicEnumField({
        default: opts.defaultVariant,
        label: `${opts.label} variant`,
      }),
    },
    scope: opts.scope,
  });

  const variantField = config.fields.variant;

  // R3 guard: `DynamicEnum.Options` matches the field by `===`, so the field we
  // hand the options contribution must be the very object the config stores.
  if (config.fields.variant !== variantField) {
    throw new Error(
      `defineVariantRegion(${opts.id}): config.fields.variant must be reference-equal to variantField.`,
    );
  }

  return Object.freeze({
    id: opts.id,
    label: opts.label,
    defaultVariant: opts.defaultVariant,
    scope: opts.scope,
    config,
    variantField,
  });
}
