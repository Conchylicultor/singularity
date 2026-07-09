import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  Stack,
  type StackProps,
  type StackDirection,
  type StackAlign,
  type StackJustify,
  type SpaceStep,
} from "./internal/stack";
export { Inset, insetClass, type InsetProps, type InsetSides } from "./internal/inset";

export default {
  description:
    "Layout spacing primitives: <Stack gap> (flex + gap) and <Inset pad> (padding) draw from the closed density spacing ramp (none|2xs|xs|sm|md|lg|xl|2xl), plus insetClass() — the same padding resolver as a class string, for consumers that only accept a className. The sanctioned home for layout rhythm; raw gap-/p-/m-/space- Tailwind is banned by no-adhoc-spacing.",
  contributions: [],
} satisfies PluginDefinition;
