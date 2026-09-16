import { defineTokenGroup } from "@plugins/ui/plugins/theme-engine/core";

export const shapeGroup = defineTokenGroup("shape", {
  radius: { default: "0.625rem", label: "Border radius" },
  spacing: { default: "0.25rem", label: "Base spacing" },
  // The extra inline room a fully-rounded end needs over a rectangle's corner,
  // added on top of the control size's own padding (`controlPad*`) on every
  // side that is a pill end — both sides of a pill button or chip, the outer
  // side of a split pill's first and last segment. A shape property, not a
  // density one: at the same size a pill and a rectangle share one padding and
  // differ only by this. 0 = pills pad exactly like rectangles.
  pillPadExtra: { default: "0rem", label: "Pill extra padding" },
});

export type ShapeTokenValues = {
  [K in keyof typeof shapeGroup.schema]: string;
};
