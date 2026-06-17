import type { PluginDefinition } from "@plugins/framework/plugins/web-sdk/core";

export {
  Stack,
  type StackProps,
  type StackDirection,
  type StackAlign,
  type StackJustify,
  type SpaceStep,
} from "./internal/stack";
export { Inset, type InsetProps } from "./internal/inset";

export default {
  description:
    "Layout spacing primitives: <Stack gap> (flex + gap) and <Inset pad> (padding) draw from the closed density spacing ramp (none|2xs|xs|sm|md|lg|xl|2xl). The sanctioned home for layout rhythm; raw gap-/p-/m-/space- Tailwind is banned by no-adhoc-spacing.",
  contributions: [],
} satisfies PluginDefinition;
