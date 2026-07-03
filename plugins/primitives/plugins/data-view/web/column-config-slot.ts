import { useCallback, useContext, type ComponentType, type ReactNode } from "react";
import {
  defineSlot,
  PluginRuntimeContext,
  type Contribution,
} from "@plugins/framework/plugins/web-sdk/core";
import { renderIsolated } from "@plugins/primitives/plugins/slot-render/web";
import { resolveTypeChain } from "@plugins/fields/core";
import type { ColumnConfigProps } from "../core";
import { useFieldIdentities } from "./internal/use-field-identities";

const SLOT_ID = "data-view.column-config";

/**
 * Per-type add-time column-config editor slot. A plain slot carrying one
 * config-editor `component` per field type, keyed by `match` (the type token).
 * Only types that need add-time configuration (e.g. `enum`'s options editor)
 * contribute; all others resolve to `null`. Mirrors the `Filter`/`ValueCodec`
 * slots — a plain `defineSlot` resolved per type honoring the `extends` chain
 * (`useResolveColumnConfig`).
 */
const ColumnConfig = defineSlot<{
  match: string;
  component: ComponentType<ColumnConfigProps>;
}>(SLOT_ID, { docLabel: (c) => c.match });

/**
 * Returns a renderer that resolves a field type's config editor (honoring
 * `extends`) and renders it error-boundary-isolated with the given props, or
 * `null` when the type contributes none. Mirrors `useResolveCell` — the resolver
 * RENDERS rather than handing back a component, so call sites never create a
 * component during render.
 */
export function useResolveColumnConfig(): (
  typeId: string,
  props: ColumnConfigProps,
) => ReactNode | null {
  const ctx = useContext(PluginRuntimeContext);
  const identities = useFieldIdentities();
  const raw0 = ctx?.bySlot.get(SLOT_ID);
  return useCallback(
    (typeId, props) => {
      const chain = resolveTypeChain(typeId, identities);
      for (const type of chain) {
        const contribution = (raw0 ?? []).find(
          (c) => (c as { match?: unknown }).match === type,
        ) as Contribution | undefined;
        if (contribution) return renderIsolated(SLOT_ID, contribution, props);
      }
      return null;
    },
    [raw0, identities],
  );
}

export { ColumnConfig };
