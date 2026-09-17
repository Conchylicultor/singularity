import type { AvatarColor } from "@plugins/primitives/plugins/avatar/core";
import type { SvgNode } from "@plugins/primitives/plugins/icon-picker/core";

/**
 * Canonical, serializable identity of an app's icon. A discriminated union so a
 * custom-image variant (`{ kind: "image"; src }`) drops in later with one render
 * branch and zero changes to existing `kind: "md"` authors.
 *
 * `color` is the app's declared tile colour (a launcher paints the icon on it).
 * Omitted, a surface derives one from the app id, so only an app whose colour is
 * part of its identity declares it.
 */
export type AppIcon = { kind: "md"; svgNodes: SvgNode[]; color?: AvatarColor };

export { appIconToSvg } from "./internal/app-icon-to-svg";
export type { AppIconSvgOptions } from "./internal/app-icon-to-svg";
