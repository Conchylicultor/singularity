import { type ControlSize } from "@plugins/primitives/plugins/css/plugins/ui-kit/web";
import { type PaneToolbarItem } from "@plugins/primitives/plugins/pane/web";
import {
  defineRenderSlot,
  type RenderSlot,
} from "@plugins/primitives/plugins/slot-render/web";

export interface PaneToolbar {
  /** Leading zone (left): nav, title, selectors. Reorderable. */
  Start: RenderSlot<PaneToolbarItem>;
  /** Trailing zone (right, `ml-auto`): actions/transport. Reorderable. */
  End: RenderSlot<PaneToolbarItem>;
  /** Zone control density override, forwarded to `PaneChrome`'s header. */
  controlSize?: ControlSize;
}

export interface PaneToolbarOptions {
  /**
   * Override the slot-level control density. The pane header's `<Bar>` host
   * already supplies the `sm` baseline — so contributions inherit `sm`
   * automatically. Pass this option to override that baseline for every
   * contribution rendered in the Start/End zones (see
   * `RenderSlotConfig.controlSize`; innermost wins). Omit to accept the `sm`
   * baseline.
   */
  controlSize?: ControlSize;
}

/**
 * Defines a pane's custom header: two **reorderable** render-slot zones
 * (`Start`/`End`) that a pane opts into via `chrome: { header }` on its
 * `Pane.define`. `PaneChrome` is the host — it renders these zones INSIDE its
 * standard `<Bar tier="pane">` instead of the default title + Actions, so a rich
 * toolbar (transport / volume / jog-wheel) becomes THE pane header at the
 * standard height with no second bar and no overflow-collapse.
 *
 * Hand-rolling a `border-b` header bar inside a pane is banned
 * (`no-adhoc-pane-toolbar` lint rule) — route the toolbar through this factory
 * instead. Every bar item is a contribution (extensible, error-isolated,
 * drag-to-reorder).
 *
 * Each app calls this once at module scope (so the slots register at import,
 * which is what lets the build pick them up as reorderable):
 *
 *   const Toolbar = definePaneToolbar("myapp.toolbar");
 *   // contribute: Toolbar.Start({ id: "back", component: BackButton })
 *   // wire up:    Pane.define({ …, chrome: { header: Toolbar } })
 */
export function definePaneToolbar(
  idBase: string,
  options?: PaneToolbarOptions,
): PaneToolbar {
  const config = {
    controlSize: options?.controlSize,
    docLabel: (p: PaneToolbarItem & { id: string }) => p.label ?? p.id,
  };
  const Start = defineRenderSlot<PaneToolbarItem>(`${idBase}.start`, config);
  const End = defineRenderSlot<PaneToolbarItem>(`${idBase}.end`, config);

  return { Start, End, controlSize: options?.controlSize };
}
