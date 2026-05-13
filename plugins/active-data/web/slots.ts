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

// Like "inline" but only applied inside backtick-wrapped inline code elements,
// never to regular text nodes. Pattern must match the full code text (no
// substring matching). Use for tokens that are valid identifiers in prose
// (e.g. plugin names) but should only link when explicitly wrapped in code.
export interface ActiveDataCodeContribution {
  display: "code";
  pattern: RegExp;
  component: ComponentType<{
    content: string;
    attrs: Record<string, string>;
  }>;
}

export type ActiveDataContribution =
  | ActiveDataBlockContribution
  | ActiveDataInlineContribution
  | ActiveDataCodeContribution;

export const ActiveData = {
  Tag: defineSlot<ActiveDataContribution>("active-data.tag", {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime discriminant; TS sees union as always having pattern
    docLabel: (p) => ("tag" in p ? p.tag : p.pattern?.source),
  }),
};
