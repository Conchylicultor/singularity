import { useMemo } from "react";
import {
  UNSAFE_unsealSlotComponent,
  type SealContributions,
} from "@plugins/framework/plugins/web-sdk/core";
import { ActiveData, type ActiveDataCodeContribution } from "../slots";

export type CodeReplaceContrib = {
  pattern: RegExp;
  Component: ActiveDataCodeContribution["component"];
};

// Returns contributions registered as display:"code" — applied only to inline
// code elements (full-text match), never to regular paragraph text nodes.
export function useActiveDataCodeReplace(): CodeReplaceContrib[] {
  const contributions = ActiveData.Tag.useContributions();
  return useMemo(
    () =>
      contributions
        .filter(
          (c): c is SealContributions<ActiveDataCodeContribution> =>
            c.display === "code",
        )
        // UNSAFE: spliced into foreign markdown ReactNode tree.
        .map((c) => ({ pattern: c.pattern, Component: UNSAFE_unsealSlotComponent(c.component) })),
    [contributions],
  );
}
