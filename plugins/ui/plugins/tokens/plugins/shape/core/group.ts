import { defineTokenGroup } from "@plugins/ui/plugins/theme-engine/core";

export const shapeGroup = defineTokenGroup("shape", {
  radius: { default: "0.625rem", label: "Border radius" },
  spacing: { default: "0.25rem", label: "Base spacing" },
});

export type ShapeTokenValues = {
  [K in keyof typeof shapeGroup.schema]: string;
};
