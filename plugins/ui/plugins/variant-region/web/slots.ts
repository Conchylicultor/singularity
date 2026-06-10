import type { ComponentType } from "react";

export interface VariantContribution<Props> {
  id: string;
  label: string;
  /**
   * Dispatch match key — set to the same string as `id`. The host uses
   * `renderIsolated` for bespoke selection because the slot serves dual duty:
   * listing variants for the picker AND dispatching to the active renderer.
   */
  match: string;
  component: ComponentType<Props>;
}
