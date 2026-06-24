import { renderIsolated } from "@plugins/primitives/plugins/slot-render/web";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { useConfig } from "@plugins/config_v2/web";
import { TabBar as Slots } from "../slots";
import { tabBarConfig } from "../internal/config";
import type { TabProps } from "../../core";

/**
 * The dispatching host: renders one tab through the user-selected variant
 * (chip / underline / connected). Mirrors the segmented-progress-bar pattern
 * exactly — `useContributions()` + `useConfig()` + find-by-`match` (falling back
 * to the first registered variant), rendered via `renderIsolated` so each tab
 * carries the error-boundary middleware.
 *
 * Refs are intentionally NOT forwarded here: a dynamically-dispatched (sealed)
 * component can't forward a root ref through the isolation middleware, and doing
 * so trips the React Compiler ref/static-component rules. A consumer that needs a
 * DOM handle (e.g. `AppTabBar`'s tooltip anchor + `scrollIntoView`) wraps `<Tab>`
 * in its own element instead.
 */
export function Tab(props: TabProps) {
  const contributions = Slots.Variant.useContributions();
  const { variant: activeId } = useConfig(tabBarConfig);
  // Select the configured variant, falling back to the first registered one.
  const active =
    contributions.find((c) => c.match === activeId) ?? contributions[0] ?? null;
  if (!active) return null;
  return renderIsolated(
    Slots.Variant.id,
    active as unknown as Contribution,
    props as TabProps,
  );
}
