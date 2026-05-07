import { defineTokenGroup } from "@plugins/ui/plugins/theme-engine/shared";

export const shapeGroup = defineTokenGroup("shape", {
  radius: { default: "0.625rem", label: "Border radius" },
});

export type ShapeTokenValues = {
  [K in keyof typeof shapeGroup.schema]: string;
};
