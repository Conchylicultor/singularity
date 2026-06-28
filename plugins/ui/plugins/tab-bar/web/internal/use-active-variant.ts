import { useConfig } from "@plugins/config_v2/web";
import { TabBar } from "../slots";
import { tabBarConfig } from "./config";

/**
 * The single source of truth for "which tab variant is active" — the configured
 * variant, falling back to the first registered one. Both the per-tab dispatcher
 * (`Tab`) and the strip host (`AppTabBar`, for `fillHeight`) read it, so they can
 * never disagree about the active variant. Returns the (sealed) contribution as
 * exposed by the slot; the render site casts it for `renderIsolated`.
 */
export function useActiveTabVariant() {
  const contributions = TabBar.Variant.useContributions();
  const { variant: activeId } = useConfig(tabBarConfig);
  return (
    contributions.find((c) => c.match === activeId) ?? contributions[0] ?? null
  );
}
