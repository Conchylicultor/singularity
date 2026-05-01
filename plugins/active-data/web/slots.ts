import { defineSlot } from "@core";
import type { ComponentType } from "react";

export interface ActiveDataBlockContribution {
  display: "block";
  tag: string;
  component: ComponentType<{
    content: string;
    attrs: Record<string, string>;
  }>;
}

export interface ActiveDataInlineContribution {
  display: "inline";
  pattern: RegExp;
  component: ComponentType<{
    content: string;
    attrs: Record<string, string>;
  }>;
}

export type ActiveDataContribution =
  | ActiveDataBlockContribution
  | ActiveDataInlineContribution;

export const ActiveData = {
  Tag: defineSlot<ActiveDataContribution>("active-data.tag"),
};
