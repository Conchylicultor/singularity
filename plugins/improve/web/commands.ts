import { defineCommand } from "@core";

export interface OpenWithTextArgs {
  /** Initial markdown text for the head card (may include inline image refs). */
  text: string;
}

export const Improve = {
  OpenWithText: defineCommand<OpenWithTextArgs, void>("improve.openWithText"),
};
