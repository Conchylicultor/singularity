import { defineSlot } from "@core";
import type { ComponentType } from "react";

export interface ActiveDataTagContribution {
  // Lowercase XML tag name (a-z, 0-9, '-'). Match is case-sensitive.
  // Optional: contributions may register a `pattern` instead, in which case
  // the component is rendered for raw-text matches anywhere in assistant text
  // and the agent never has to wrap anything in a tag.
  tag?: string;
  // Regex (must use the `g` flag) used to detect inline matches in plain text
  // children. The matched substring is passed as `children` to the component;
  // `attrs` is empty for pattern matches.
  pattern?: RegExp;
  component: ComponentType<{
    attrs: Record<string, string>;
    children: string;
  }>;
}

export const ActiveData = {
  Tag: defineSlot<ActiveDataTagContribution>("active-data.tag"),
};
