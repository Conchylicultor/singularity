import { defineDetailSections } from "@plugins/primitives/plugins/detail-sections/web";
import { defineFieldExtensions } from "@plugins/primitives/plugins/data-view/web";
import type { Deployment } from "../core";

/**
 * The sections of one deployment's pane. The pane itself owns no content — the
 * overview (this plugin), the release pipeline and its output (the
 * `release-pipeline` sibling) are all contributions, exactly as
 * `CompositionDetail` is in Studio.
 *
 * The four pipeline STEPS are deliberately not a slot: Converge → Build →
 * Rehearse → Ship is a closed, ordered list whose gating between steps IS the
 * content. The sections are the open set.
 */
export const DeploymentDetail = defineDetailSections<{ deploymentId: string }>(
  "deployment-detail",
  { collapsible: true, defaultOpen: true },
);

export const Deployments = {
  /**
   * Extra DataView `FieldDef<Deployment>[]` injected by other plugins — the
   * `Servers.Fields` ← `health.StatusField` precedent one level down. It is what
   * lets the `Release` column exist without this plugin ever naming the release
   * feature: remove `release-pipeline` and the column simply disappears.
   */
  Fields: defineFieldExtensions<Deployment>("deploy.deployments.fields"),
};
