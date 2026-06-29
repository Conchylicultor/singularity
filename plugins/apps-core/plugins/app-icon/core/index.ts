import type { SvgNode } from "@plugins/primitives/plugins/icon-picker/core";

/**
 * Canonical, serializable identity of an app's icon. A discriminated union so a
 * custom-image variant (`{ kind: "image"; src }`) drops in later with one render
 * branch and zero changes to existing `kind: "md"` authors.
 */
export type AppIcon = { kind: "md"; svgNodes: SvgNode[] };
