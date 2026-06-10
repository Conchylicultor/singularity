import type { ComponentType } from "react";
import type { Contribution, Slot } from "@plugins/framework/plugins/web-sdk/core";
import { useConfig } from "@plugins/config_v2/web";
import { useCurrentAppId } from "@plugins/apps/web";
import { renderIsolated } from "@plugins/primitives/plugins/slot-render/web";
import type { VariantRegionCore } from "../../core";
import type { VariantContribution } from "../slots";

/**
 * The live chrome host. Reads the active variant from config scoped to the
 * current app (`app:<id>`), falling back transparently to base when the app is
 * not forked, then dispatches to the matching variant via `renderIsolated`.
 */
export function createRegion<Props>(
  core: VariantRegionCore<Props>,
  slot: Slot<VariantContribution<Props>>,
): ComponentType<Props> {
  function Region(props: Props) {
    const contributions = slot.useContributions();
    const appId = useCurrentAppId();
    const scopeId =
      core.scope === "app" && appId ? `app:${appId}` : undefined;
    const { variant: activeId } = useConfig(core.config, { scopeId });
    const active =
      contributions.find((c) => c.match === activeId) ??
      contributions[0] ??
      null;
    if (!active) return null;
    return renderIsolated(
      slot.id,
      active as unknown as Contribution,
      props as object,
    );
  }
  return Region as ComponentType<Props>;
}
