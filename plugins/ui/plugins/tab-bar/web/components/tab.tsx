import { renderIsolated } from "@plugins/primitives/plugins/slot-render/web";
import type { Contribution } from "@plugins/framework/plugins/web-sdk/core";
import { TabBar as Slots } from "../slots";
import { useActiveTabVariant } from "../internal/use-active-variant";
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
  const active = useActiveTabVariant();
  if (!active) return null;
  return renderIsolated(
    Slots.Variant.id,
    active as unknown as Contribution,
    props as TabProps,
  );
}
