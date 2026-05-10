import { useMemo } from "react";
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
        .filter((c): c is ActiveDataCodeContribution => c.display === "code")
        .map((c) => ({ pattern: c.pattern, Component: c.component })),
    [contributions],
  );
}
