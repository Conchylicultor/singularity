import type { ComponentType } from "react";
import { defineSlot } from "@plugins/framework/plugins/web-sdk/core";
import type { PrototypeMeta } from "@plugins/apps/plugins/prototypes/plugins/files/core";

/**
 * What every stage is handed. The pane resolves these once — it has to, to say
 * "Prototype not found" — so a stage is a pure function of them and subscribes
 * to nothing itself.
 */
export interface PrototypeStageProps {
  /** The prototype the pane is open on. */
  meta: PrototypeMeta;
  /**
   * Every prototype in the gallery, already loaded — a stage that puts
   * prototypes side by side needs no second subscription of its own.
   */
  gallery: PrototypeMeta[];
  /**
   * Cache-bust for every prototype iframe `src`. It bumps when the watcher sees
   * an edit, which is what reloads a stage's iframes live.
   */
  version: number;
}

/**
 * One stage of the detail pane: an entry in the header switcher, and the body it
 * paints when picked.
 */
export interface PrototypeStageContribution {
  /** Identity in the switcher and in the pane's active-stage state. */
  id: string;
  /** What the switcher chip reads. */
  label: string;
  /** Ascending; ties keep registration order. Defaults to 0. */
  order?: number;
  component: ComponentType<PrototypeStageProps>;
}

/**
 * The stage set is OPEN. The gallery contributes Focus and Compare like anyone
 * else would, and names no stage anywhere outside its own two contributions —
 * so a sibling plugin adds a third (e.g. a prototype beside the real component
 * it mocks) without this plugin changing.
 *
 * A plain slot rather than `defineRenderSlot`: exactly one stage paints at a
 * time, picked by id, so there is no list to render. It is the shape
 * `defineTabbedView` uses internally — but that factory owns the switcher's
 * placement (stacked above its body) and this pane's switcher is a header
 * action-bar contribution, several components away from the body it drives.
 */
export const PrototypeStages = {
  Stage: defineSlot<PrototypeStageContribution>({ docLabel: (c) => c.label }),
};
